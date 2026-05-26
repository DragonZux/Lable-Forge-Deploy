from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks, Query
from typing import List, Optional
from app.core.database import get_database
from app.models.user import UserInDB
from app.models.workspace_invitation import (
    WorkspaceInvitationCreate, 
    WorkspaceInvitationInDB, 
    WorkspaceInvitationResponse
)
from app.utils.auth import get_current_user
from app.services.notification_service import NotificationService
from app.services.email_service import EmailService
from app.utils.invitation_utils import generate_invitation_token, get_expires_at
from bson import ObjectId
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorDatabase

router = APIRouter(prefix="/workspaces/{workspace_id}/invitations", tags=["Workspace Invitations"])

@router.post("", response_model=WorkspaceInvitationResponse, status_code=status.HTTP_201_CREATED)
async def create_workspace_invitation(
    workspace_id: str,
    invitation_data: WorkspaceInvitationCreate,
    background_tasks: BackgroundTasks,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: UserInDB = Depends(get_current_user)
):
    # 1. Check workspace existence and permissions
    workspace = await db.workspaces.find_one({"_id": ObjectId(workspace_id)})
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    
    user_role = next((m["role"] for m in workspace.get("members", []) if m["user_id"] == str(current_user.id)), None)
    if user_role not in ["owner", "admin"]:
        raise HTTPException(status_code=403, detail="Only owner or admin can invite members")
    
    # 2. Lookup invitee user and check if already a member.
    invitee_user = await db.users.find_one({"email": invitation_data.email})
    invitee_user_id = str(invitee_user["_id"]) if invitee_user else None
    if invitee_user_id and any(
        m["user_id"] == invitee_user_id for m in workspace.get("members", [])
    ):
        raise HTTPException(status_code=400, detail="User is already a member of this workspace")

    # 3. Check for existing pending invitation
    existing_invite = await db.workspace_invitations.find_one({
        "workspace_id": workspace_id,
        "invitee_email": invitation_data.email,
        "status": "pending"
    })
    if existing_invite:
        raise HTTPException(status_code=400, detail="A pending invitation already exists for this email")

    # 5. Create invitation record
    token = generate_invitation_token()
    invitation_doc = {
        "workspace_id": workspace_id,
        "workspace_name": workspace["name"],
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
    
    result = await db.workspace_invitations.insert_one(invitation_doc)
    invitation_doc["_id"] = str(result.inserted_id)
    invitation = WorkspaceInvitationInDB(**invitation_doc)
    
    # 6. Create notification if user exists
    if invitee_user_id:
        background_tasks.add_task(
            NotificationService.create_invitation_notification,
            db,
            "workspace_invitation_received",
            invitee_user_id,
            invitation,
            current_user.full_name,
            getattr(current_user, "avatar_url", None)
        )
    
    # 7. Send email
    background_tasks.add_task(
        EmailService.send_workspace_invitation,
        invitation_data.email,
        invitee_user["full_name"] if invitee_user else None,
        current_user.full_name,
        workspace["name"],
        invitation_data.role,
        token,
        invitation_data.message,
        invitee_user is not None
    )
    
    return WorkspaceInvitationResponse(**invitation.model_dump())

@router.get("", response_model=List[WorkspaceInvitationResponse])
async def list_workspace_invitations(
    workspace_id: str,
    status: Optional[str] = Query(None),
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: UserInDB = Depends(get_current_user)
):
    # Check permissions
    workspace = await db.workspaces.find_one({"_id": ObjectId(workspace_id)})
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    
    user_role = next((m["role"] for m in workspace.get("members", []) if m["user_id"] == str(current_user.id)), None)
    if user_role not in ["owner", "admin"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    query = {"workspace_id": workspace_id}
    if status:
        query["status"] = status
        
    cursor = db.workspace_invitations.find(query).sort("created_at", -1)
    invitations = []
    async for doc in cursor:
        doc["id"] = str(doc["_id"])
        invitations.append(WorkspaceInvitationResponse(**doc))
        
    return invitations

@router.delete("/{invitation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def cancel_workspace_invitation(
    workspace_id: str,
    invitation_id: str,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: UserInDB = Depends(get_current_user)
):
    # Check permissions
    workspace = await db.workspaces.find_one({"_id": ObjectId(workspace_id)})
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    
    user_role = next((m["role"] for m in workspace.get("members", []) if m["user_id"] == str(current_user.id)), None)
    if user_role not in ["owner", "admin"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Update status to cancelled
    result = await db.workspace_invitations.update_one(
        {"_id": ObjectId(invitation_id), "workspace_id": workspace_id, "status": "pending"},
        {"$set": {"status": "cancelled", "responded_at": datetime.utcnow()}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Pending invitation not found or already processed")
    
    return None
