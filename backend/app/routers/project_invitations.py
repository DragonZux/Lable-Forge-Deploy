from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks, Query
from typing import List, Optional
from app.core.database import get_database
from app.models.user import UserInDB
from app.models.project_invitation import (
    ProjectInvitationCreate, 
    ProjectInvitationInDB, 
    ProjectInvitationResponse
)
from app.utils.auth import get_current_user
from app.services.notification_service import NotificationService
from app.services.email_service import EmailService
from app.utils.invitation_utils import generate_invitation_token, get_expires_at
from bson import ObjectId
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorDatabase

router = APIRouter(prefix="/projects/{project_id}/invitations", tags=["Project Invitations"])

@router.post("", response_model=ProjectInvitationResponse, status_code=status.HTTP_201_CREATED)
async def create_project_invitation(
    project_id: str,
    invitation_data: ProjectInvitationCreate,
    background_tasks: BackgroundTasks,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: UserInDB = Depends(get_current_user)
):
    # 1. Check project existence
    project = await db.projects.find_one({"_id": ObjectId(project_id)})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    workspace_id = project["workspace_id"]
    
    # 2. Check permissions
    # User must be workspace owner/admin OR project admin
    workspace = await db.workspaces.find_one({"_id": ObjectId(workspace_id)})
    ws_role = next((m["role"] for m in workspace.get("members", []) if m["user_id"] == str(current_user.id)), None)
    project_role = next((m["role"] for m in project.get("members", []) if m["user_id"] == str(current_user.id)), None)
    
    if ws_role not in ["owner", "admin"] and project_role != "admin":
        raise HTTPException(status_code=403, detail="Insufficient permissions to invite to this project")
    
    # 3. Check if already a member of PROJECT
    invitee_user = await db.users.find_one({"email": invitation_data.email})
    if invitee_user:
        invitee_user_id = str(invitee_user["_id"])
        if any(m["user_id"] == invitee_user_id for m in project.get("members", [])):
            raise HTTPException(status_code=400, detail="User is already a member of this project")
    else:
        invitee_user_id = None

    # 4. Check for existing pending invitation
    existing_invite = await db.project_invitations.find_one({
        "project_id": project_id,
        "invitee_email": invitation_data.email,
        "status": "pending"
    })
    if existing_invite:
        raise HTTPException(status_code=400, detail="A pending invitation already exists for this email")

    # 5. Create invitation record
    token = generate_invitation_token()
    invitation_doc = {
        "project_id": project_id,
        "project_name": project["name"],
        "workspace_id": workspace_id,
        "invited_by_user_id": str(current_user.id),
        "invited_by_name": current_user.full_name,
        "invited_by_avatar": getattr(current_user, "avatar_url", None),
        "invitee_email": invitation_data.email,
        "invitee_user_id": invitee_user_id,
        "role": invitation_data.role,
        "status": "pending",
        "token": token,
        "message": invitation_data.message,
        "created_at": datetime.utcnow(),
        "expires_at": get_expires_at(7)
    }
    
    result = await db.project_invitations.insert_one(invitation_doc)
    invitation_doc["_id"] = str(result.inserted_id)
    invitation = ProjectInvitationInDB(**invitation_doc)
    
    # 6. Create notification if user exists
    if invitee_user_id:
        background_tasks.add_task(
            NotificationService.create_invitation_notification,
            db,
            "project_invitation_received",
            invitee_user_id,
            invitation,
            current_user.full_name,
            getattr(current_user, "avatar_url", None)
        )
    
    # 7. Send email
    background_tasks.add_task(
        EmailService.send_project_invitation,
        invitation_data.email,
        invitee_user["full_name"] if invitee_user else None,
        current_user.full_name,
        project["name"],
        workspace["name"],
        invitation_data.role,
        token,
        invitation_data.message,
        invitee_user is not None
    )
    
    return ProjectInvitationResponse(**invitation.model_dump())

@router.get("", response_model=List[ProjectInvitationResponse])
async def list_project_invitations(
    project_id: str,
    status: Optional[str] = Query(None),
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: UserInDB = Depends(get_current_user)
):
    # Check permissions
    project = await db.projects.find_one({"_id": ObjectId(project_id)})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    workspace = await db.workspaces.find_one({"_id": ObjectId(project["workspace_id"])})
    ws_role = next((m["role"] for m in workspace.get("members", []) if m["user_id"] == str(current_user.id)), None)
    project_role = next((m["role"] for m in project.get("members", []) if m["user_id"] == str(current_user.id)), None)
    
    if ws_role not in ["owner", "admin"] and project_role != "admin":
        raise HTTPException(status_code=403, detail="Access denied")
    
    query = {"project_id": project_id}
    if status:
        query["status"] = status
        
    cursor = db.project_invitations.find(query).sort("created_at", -1)
    invitations = []
    async for doc in cursor:
        doc["id"] = str(doc["_id"])
        invitations.append(ProjectInvitationResponse(**doc))
        
    return invitations

@router.delete("/{invitation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def cancel_project_invitation(
    project_id: str,
    invitation_id: str,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: UserInDB = Depends(get_current_user)
):
    project = await db.projects.find_one({"_id": ObjectId(project_id)})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    workspace = await db.workspaces.find_one({"_id": ObjectId(project["workspace_id"])})
    ws_role = next((m["role"] for m in workspace.get("members", []) if m["user_id"] == str(current_user.id)), None)
    project_role = next((m["role"] for m in project.get("members", []) if m["user_id"] == str(current_user.id)), None)
    
    if ws_role not in ["owner", "admin"] and project_role != "admin":
        raise HTTPException(status_code=403, detail="Access denied")
    
    result = await db.project_invitations.update_one(
        {"_id": ObjectId(invitation_id), "project_id": project_id, "status": "pending"},
        {"$set": {"status": "cancelled", "responded_at": datetime.utcnow()}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Pending invitation not found or already processed")
    
    return None
