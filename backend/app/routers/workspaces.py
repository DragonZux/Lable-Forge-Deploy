from fastapi import APIRouter, HTTPException, status, Depends, BackgroundTasks
from pydantic import BaseModel, EmailStr
from typing import List, Literal
from app.models.workspace import WorkspaceCreate, WorkspaceResponse, MemberRef
from app.models.user import UserInDB, UserResponse
from app.core.database import get_database
from app.core.storage import storage_client
from app.core.redis import cache_delete
from app.utils.auth import get_current_user
from app.utils.cache import cache_response
from bson import ObjectId
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.models.workspace_invitation import WorkspaceInvitationResponse, WorkspaceInvitationInDB
from app.services.notification_service import NotificationService

router = APIRouter(prefix="/workspaces", tags=["Workspaces"])


class AddMemberRequest(BaseModel):
    email: EmailStr
    role: Literal["member", "viewer"] = "member"


class UpdateMemberRoleRequest(BaseModel):
    role: Literal["admin", "member", "viewer"]


class UpdateWorkspaceRequest(BaseModel):
    name: str


@router.get("", response_model=List[WorkspaceResponse])
async def list_workspaces(current_user: UserInDB = Depends(get_current_user)):
    """
    Get all workspaces where current user is a workspace member.
    """
    db = get_database()
    user_id = str(current_user.id)
    member_workspaces = await db.workspaces.find({
        "members.user_id": user_id
    }).to_list(None)

    project_rows = await db.projects.find(
        {"members.user_id": user_id},
        {"workspace_id": 1},
    ).to_list(None)
    project_workspace_ids = {
        row.get("workspace_id")
        for row in project_rows
        if row.get("workspace_id") and ObjectId.is_valid(row.get("workspace_id"))
    }
    existing_ids = {str(ws["_id"]) for ws in member_workspaces}
    missing_workspace_ids = [
        ObjectId(workspace_id)
        for workspace_id in project_workspace_ids
        if workspace_id not in existing_ids
    ]
    project_workspaces = []
    if missing_workspace_ids:
        project_workspaces = await db.workspaces.find(
            {"_id": {"$in": missing_workspace_ids}}
        ).to_list(None)
    
    response = []
    for ws in member_workspaces + project_workspaces:
        workspace_response = WorkspaceResponse(
            id=str(ws["_id"]),
            name=ws["name"],
            plan=ws.get("plan", "free"),
            owner_id=str(ws.get("owner_id")) if ws.get("owner_id") else None,
            member_count=len(ws.get("members", [])),
            created_at=ws["created_at"]
        )
        response.append(workspace_response.model_dump())
    return response


@router.post("", response_model=WorkspaceResponse, status_code=status.HTTP_201_CREATED)
async def create_workspace(
    workspace_data: WorkspaceCreate,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Create a new workspace.
    """
    db = get_database()
    workspace_doc = {
        "name": workspace_data.name,
        "owner_id": current_user.id,
        "plan": "free",
        "members": [
            MemberRef(user_id=current_user.id, role="owner").model_dump()
        ],
        "created_at": datetime.utcnow()
    }
    result = await db.workspaces.insert_one(workspace_doc)
    await cache_delete(f"workspaces:{current_user.id}")
    
    return WorkspaceResponse(
        id=str(result.inserted_id),
        name=workspace_doc["name"],
        plan=workspace_doc["plan"],
        owner_id=str(current_user.id),
        member_count=1,
        created_at=workspace_doc["created_at"]
    )


@router.get("/{workspace_id}")
async def get_workspace(
    workspace_id: str,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Get workspace details.
    """
    db = get_database()
    try:
        ws_id = ObjectId(workspace_id)
    except:
        raise HTTPException(status_code=400, detail="Invalid workspace ID")
        
    workspace = await db.workspaces.find_one({"_id": ws_id})
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
        
    user_id = str(current_user.id)
    # Check access
    member = next((m for m in workspace.get("members", []) if m["user_id"] == user_id), None)
    
    project_membership = await db.projects.find_one({
        "workspace_id": workspace_id,
        "members.user_id": user_id,
    })
    if not member and not project_membership:
        raise HTTPException(status_code=403, detail="Access denied")
        
    # Get member details
    members_data = []
    for member in workspace.get("members", []):
        try:
            user_doc = await db.users.find_one({"_id": ObjectId(member["user_id"])})
            if user_doc:
                members_data.append({
                    "user_id": member["user_id"],
                    "email": user_doc["email"],
                    "full_name": user_doc["full_name"],
                    "role": member["role"]
                })
            else:
                # Fallback if user not found but in members list
                members_data.append({
                    "user_id": member["user_id"],
                    "email": member.get("email", "Unknown"),
                    "full_name": member.get("full_name", "Unknown"),
                    "role": member["role"]
                })
        except:
            # Skip or handle invalid user IDs
            continue
            
    return {
        "id": str(workspace["_id"]),
        "name": workspace["name"],
        "plan": workspace.get("plan", "free"),
        "owner_id": str(workspace["owner_id"]),
        "member_count": len(members_data),
        "members": members_data,
        "created_at": workspace["created_at"]
    }


@router.patch("/{workspace_id}", response_model=WorkspaceResponse)
async def update_workspace(
    workspace_id: str,
    workspace_data: UpdateWorkspaceRequest,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Update workspace name.
    """
    db = get_database()
    try:
        ws_id = ObjectId(workspace_id)
    except:
        raise HTTPException(status_code=400, detail="Invalid workspace ID")
        
    workspace = await db.workspaces.find_one({"_id": ws_id})
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
        
    # Check authorization
    current_user_id = str(current_user.id)
    user_role = next((m["role"] for m in workspace.get("members", []) if m["user_id"] == current_user_id), None)
    if user_role not in ["owner", "admin"]:
        raise HTTPException(status_code=403, detail="Only owner or admin can update")
        
    await db.workspaces.update_one({"_id": ws_id}, {"$set": {"name": workspace_data.name}})
    await cache_delete(f"workspaces:{current_user.id}")
    
    return WorkspaceResponse(
        id=str(workspace["_id"]),
        name=workspace_data.name,
        plan=workspace.get("plan", "free"),
        owner_id=str(workspace.get("owner_id")) if workspace.get("owner_id") else None,
        member_count=len(workspace.get("members", [])),
        created_at=workspace["created_at"]
    )


@router.delete("/{workspace_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workspace(
    workspace_id: str,
    background_tasks: BackgroundTasks,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Delete a workspace and all data scoped under its projects.
    Only the workspace owner can delete the workspace.
    """
    db = get_database()
    try:
        ws_id = ObjectId(workspace_id)
    except:
        raise HTTPException(status_code=400, detail="Invalid workspace ID")

    workspace = await db.workspaces.find_one({"_id": ws_id})
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")

    current_user_id = str(current_user.id)
    owner_id = str(workspace.get("owner_id"))
    owner_member = next(
        (
            member for member in workspace.get("members", [])
            if member.get("user_id") == current_user_id and member.get("role") == "owner"
        ),
        None,
    )
    if owner_id != current_user_id and not owner_member:
        raise HTTPException(status_code=403, detail="Only workspace owner can delete")

    projects = await db.projects.find({"workspace_id": workspace_id}).to_list(None)
    project_ids = [str(project["_id"]) for project in projects]
    project_oids = [project["_id"] for project in projects]

    if project_ids:
        images = await db.images.find({"project_id": {"$in": project_ids}}).to_list(None)
        for image in images:
            filename = image.get("filename")
            if filename:
                background_tasks.add_task(storage_client.delete_file, filename)

        await db.projects.delete_many({"_id": {"$in": project_oids}})
        await db.images.delete_many({"project_id": {"$in": project_ids}})
        await db.annotations.delete_many({"project_id": {"$in": project_ids}})
        await db.annotation_audit_logs.delete_many({"project_id": {"$in": project_ids}})
        await db.class_labels.delete_many({"project_id": {"$in": project_ids}})
        await db.dataset_versions.delete_many({"project_id": {"$in": project_ids}})
        await db.training_jobs.delete_many({"project_id": {"$in": project_ids}})
        await db.deployed_models.delete_many({"project_id": {"$in": project_ids}})
        await db.cvat_integrations.delete_many({"project_id": {"$in": project_ids}})
        await db.project_invitations.update_many(
            {"project_id": {"$in": project_ids}, "status": "pending"},
            {"$set": {"status": "cancelled", "responded_at": datetime.utcnow()}},
        )

    await db.workspace_invitations.update_many(
        {"workspace_id": workspace_id, "status": "pending"},
        {"$set": {"status": "cancelled", "responded_at": datetime.utcnow()}},
    )
    await db.notifications.delete_many({
        "$or": [
            {"entity_type": "workspace", "entity_id": workspace_id},
            {"entity_type": "project", "entity_id": {"$in": project_ids}},
        ]
    })
    await db.workspaces.delete_one({"_id": ws_id})

    for member in workspace.get("members", []):
        await cache_delete(f"workspaces:{member.get('user_id')}")
    await cache_delete(f"workspaces:{current_user.id}")

    return None


@router.post("/{workspace_id}/members", status_code=status.HTTP_201_CREATED)
async def add_member(
    workspace_id: str,
    member_data: AddMemberRequest,
    current_user: UserInDB = Depends(get_current_user)
):
    db = get_database()
    try:
        ws_id = ObjectId(workspace_id)
    except:
        raise HTTPException(status_code=400, detail="Invalid workspace ID")
        
    workspace = await db.workspaces.find_one({"_id": ws_id})
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
        
    current_user_id = str(current_user.id)
    user_role = next((m["role"] for m in workspace.get("members", []) if m["user_id"] == current_user_id), None)
    if user_role not in ["owner", "admin"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
        
    target_user = await db.users.find_one({"email": member_data.email})
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
        
    target_user_id = str(target_user["_id"])
    if any(m["user_id"] == target_user_id for m in workspace.get("members", [])):
        raise HTTPException(status_code=400, detail="User already a member")
        
    await db.workspaces.update_one(
        {"_id": ws_id},
        {"$push": {"members": MemberRef(user_id=target_user_id, role=member_data.role).model_dump()}}
    )
    await cache_delete(f"workspaces:{current_user.id}")
    return {"status": "success"}


@router.patch("/{workspace_id}/members/{user_id}")
async def update_member_role(
    workspace_id: str,
    user_id: str,
    role_data: UpdateMemberRoleRequest,
    current_user: UserInDB = Depends(get_current_user)
):
    db = get_database()
    try:
        ws_id = ObjectId(workspace_id)
    except:
        raise HTTPException(status_code=400, detail="Invalid workspace ID")

    workspace = await db.workspaces.find_one({"_id": ws_id})
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")

    current_user_id = str(current_user.id)
    current_member = next(
        (m for m in workspace.get("members", []) if m["user_id"] == current_user_id),
        None
    )
    if not current_member or current_member.get("role") not in ["owner", "admin"]:
        raise HTTPException(status_code=403, detail="Only owner or admin can update member roles")

    if user_id == current_user_id:
        raise HTTPException(status_code=400, detail="Cannot change your own role")

    target_member = next(
        (m for m in workspace.get("members", []) if m["user_id"] == user_id),
        None
    )
    if not target_member:
        raise HTTPException(status_code=404, detail="Member not found")

    if target_member.get("role") == "owner":
        raise HTTPException(status_code=400, detail="Cannot change owner role")

    await db.workspaces.update_one(
        {"_id": ws_id, "members.user_id": user_id},
        {"$set": {"members.$.role": role_data.role}}
    )
    await cache_delete(f"workspaces:{current_user.id}")
    await cache_delete(f"workspaces:{user_id}")

    return {"status": "success", "user_id": user_id, "role": role_data.role}


@router.get("/invitations/my", response_model=List[WorkspaceInvitationResponse])
async def get_my_workspace_invitations(
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Get all pending workspace invitations for the current user.
    """
    cursor = db.workspace_invitations.find({
        "invitee_email": current_user.email,
        "status": "pending"
    }).sort("created_at", -1)
    
    invitations = []
    async for doc in cursor:
        doc["id"] = str(doc["_id"])
        invitations.append(WorkspaceInvitationResponse(**doc))
        
    return invitations


@router.delete("/{workspace_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    workspace_id: str,
    user_id: str,
    current_user: UserInDB = Depends(get_current_user)
):
    db = get_database()
    try:
        ws_id = ObjectId(workspace_id)
    except:
        raise HTTPException(status_code=400, detail="Invalid workspace ID")
        
    workspace = await db.workspaces.find_one({"_id": ws_id})
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")

    current_user_id = str(current_user.id)
    user_role = next((m["role"] for m in workspace.get("members", []) if m["user_id"] == current_user_id), None)
    if user_role not in ["owner", "admin"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    if user_id == current_user_id:
        raise HTTPException(status_code=400, detail="Cannot remove yourself from workspace")
        
    target_role = next((m["role"] for m in workspace.get("members", []) if m["user_id"] == user_id), None)
    if not target_role:
        raise HTTPException(status_code=404, detail="Member not found")

    if target_role == "owner":
        raise HTTPException(status_code=400, detail="Cannot remove owner")
        
    await db.workspaces.update_one({"_id": ws_id}, {"$pull": {"members": {"user_id": user_id}}})
    await cache_delete(f"workspaces:{current_user.id}")
    await cache_delete(f"workspaces:{user_id}")
    return None
