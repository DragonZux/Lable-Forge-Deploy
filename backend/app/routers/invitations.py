from fastapi import APIRouter, Depends, HTTPException, status
from app.core.database import get_database
from app.models.user import UserInDB
from app.utils.auth import get_current_user
from app.services.notification_service import NotificationService
from app.models.workspace_invitation import WorkspaceInvitationResponse, WorkspaceInvitationInDB
from app.models.project_invitation import ProjectInvitationResponse, ProjectInvitationInDB
from bson import ObjectId
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorDatabase

router = APIRouter(prefix="/invitations", tags=["Invitations"])


async def _find_pending_invitation(db: AsyncIOMotorDatabase, collection_name: str, token_or_id: str, user_id: str):
    collection = getattr(db, collection_name)
    query_values = [{"token": token_or_id}]
    if ObjectId.is_valid(token_or_id):
        query_values.append({"_id": ObjectId(token_or_id)})

    invitation = await collection.find_one({
        "status": "pending",
        "$or": query_values,
    })
    if invitation:
        return invitation

    notification = await db.notifications.find_one({
        "user_id": user_id,
        "$or": [
            {"token": token_or_id},
            {"invitation_id": token_or_id},
        ],
    })
    if not notification:
        return None

    fallback_values = []
    notification_token = notification.get("token")
    notification_invitation_id = notification.get("invitation_id")
    if notification_token:
        fallback_values.append({"token": notification_token})
    if notification_invitation_id and ObjectId.is_valid(notification_invitation_id):
        fallback_values.append({"_id": ObjectId(notification_invitation_id)})
    if not fallback_values:
        return None

    return await collection.find_one({
        "status": "pending",
        "$or": fallback_values,
    })


async def _find_invitation_by_token_or_id(db: AsyncIOMotorDatabase, collection_name: str, token_or_id: str):
    collection = getattr(db, collection_name)
    query_values = [{"token": token_or_id}]
    if ObjectId.is_valid(token_or_id):
        query_values.append({"_id": ObjectId(token_or_id)})
    return await collection.find_one({"$or": query_values})


def _invitation_payload(invitation: dict) -> dict:
    payload = invitation.copy()
    payload["_id"] = str(payload["_id"])
    return payload

@router.post("/workspace/{token}/accept")
async def accept_workspace_invitation(
    token: str,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Accept a workspace invitation.
    """
    invitation = await _find_pending_invitation(
        db,
        "workspace_invitations",
        token,
        str(current_user.id),
    )
    if not invitation:
        processed = await _find_invitation_by_token_or_id(db, "workspace_invitations", token)
        if (
            processed
            and processed.get("status") == "accepted"
            and processed.get("invitee_email") == current_user.email
        ):
            return {
                "message": "Already joined workspace",
                "workspace_id": processed["workspace_id"],
            }
        raise HTTPException(status_code=404, detail="Invitation not found or already processed")
    
    if datetime.utcnow() > invitation["expires_at"]:
        await db.workspace_invitations.update_one(
            {"_id": invitation["_id"]}, 
            {"$set": {"status": "expired"}}
        )
        raise HTTPException(status_code=410, detail="Invitation has expired")
    
    if invitation["invitee_email"] != current_user.email:
        raise HTTPException(status_code=403, detail="This invitation is not for you")
    
    if not ObjectId.is_valid(invitation["workspace_id"]):
        raise HTTPException(status_code=400, detail="Invalid workspace ID")

    workspace_id = ObjectId(invitation["workspace_id"])
    workspace = await db.workspaces.find_one({"_id": workspace_id})
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    
    # Add member
    await db.workspaces.update_one(
        {"_id": workspace_id},
        {"$addToSet": {"members": {"user_id": str(current_user.id), "role": invitation["role"]}}}
    )
    
    # Update invitation
    await db.workspace_invitations.update_one(
        {"_id": invitation["_id"]},
        {"$set": {"status": "accepted", "responded_at": datetime.utcnow(), "invitee_user_id": str(current_user.id)}}
    )
    await NotificationService.mark_action_taken(db, str(invitation["_id"]), str(current_user.id))
    
    # Notify inviter
    invitation_obj = WorkspaceInvitationInDB(**_invitation_payload(invitation))
    await NotificationService.create_invitation_notification(
        db,
        "workspace_invitation_accepted",
        invitation["invited_by_user_id"],
        invitation_obj,
        current_user.full_name,
        getattr(current_user, "avatar_url", None)
    )
    
    return {
        "message": "Successfully joined workspace",
        "workspace_id": invitation["workspace_id"],
    }

@router.post("/workspace/{token}/decline")
async def decline_workspace_invitation(
    token: str,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Decline a workspace invitation.
    """
    invitation = await _find_pending_invitation(
        db,
        "workspace_invitations",
        token,
        str(current_user.id),
    )
    if not invitation:
        processed = await _find_invitation_by_token_or_id(db, "workspace_invitations", token)
        if (
            processed
            and processed.get("status") == "accepted"
            and processed.get("invitee_email") == current_user.email
        ):
            return {
                "message": "Already joined project",
                "project_id": processed["project_id"],
                "workspace_id": processed["workspace_id"],
            }
        raise HTTPException(status_code=404, detail="Invitation not found or already processed")
    
    if invitation["invitee_email"] != current_user.email:
        raise HTTPException(status_code=403, detail="This invitation is not for you")
    
    await db.workspace_invitations.update_one(
        {"_id": invitation["_id"]},
        {"$set": {"status": "declined", "responded_at": datetime.utcnow()}}
    )
    await NotificationService.mark_action_taken(db, str(invitation["_id"]), str(current_user.id))

    invitation_obj = WorkspaceInvitationInDB(**_invitation_payload(invitation))
    await NotificationService.create_invitation_notification(
        db,
        "workspace_invitation_declined",
        invitation["invited_by_user_id"],
        invitation_obj,
        current_user.full_name,
        getattr(current_user, "avatar_url", None)
    )
    
    return {"message": "Invitation declined"}

@router.post("/project/{token}/accept")
async def accept_project_invitation(
    token: str,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: UserInDB = Depends(get_current_user)
):
    invitation = await _find_pending_invitation(
        db,
        "project_invitations",
        token,
        str(current_user.id),
    )
    if not invitation:
        processed = await _find_invitation_by_token_or_id(db, "project_invitations", token)
        if (
            processed
            and processed.get("status") == "accepted"
            and processed.get("invitee_email") == current_user.email
        ):
            return {
                "message": "Already joined project",
                "project_id": processed["project_id"],
                "workspace_id": processed["workspace_id"],
            }
        raise HTTPException(status_code=404, detail="Invitation not found or already processed")
    
    if datetime.utcnow() > invitation["expires_at"]:
        await db.project_invitations.update_one(
            {"_id": invitation["_id"]}, 
            {"$set": {"status": "expired"}}
        )
        raise HTTPException(status_code=410, detail="Invitation has expired")
    
    if invitation["invitee_email"] != current_user.email:
        raise HTTPException(status_code=403, detail="This invitation is not for you")
    
    if not ObjectId.is_valid(invitation["project_id"]):
        raise HTTPException(status_code=400, detail="Invalid project ID")

    project_id = ObjectId(invitation["project_id"])
    project = await db.projects.find_one({"_id": project_id})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    current_user_id = str(current_user.id)
    joined_at = datetime.utcnow()
    existing_member = next(
        (member for member in project.get("members", []) if member.get("user_id") == current_user_id),
        None,
    )
    if existing_member:
        await db.projects.update_one(
            {"_id": project_id, "members.user_id": current_user_id},
            {"$set": {"members.$.role": invitation["role"]}},
        )
    else:
        await db.projects.update_one(
            {"_id": project_id},
            {"$push": {"members": {"user_id": current_user_id, "role": invitation["role"], "joined_at": joined_at}}},
        )
    
    # Update invitation
    await db.project_invitations.update_one(
        {"_id": invitation["_id"]},
        {"$set": {"status": "accepted", "responded_at": datetime.utcnow(), "invitee_user_id": str(current_user.id)}}
    )
    await NotificationService.mark_action_taken(db, str(invitation["_id"]), str(current_user.id))
    
    # Notify inviter
    invitation_obj = ProjectInvitationInDB(**_invitation_payload(invitation))
    await NotificationService.create_invitation_notification(
        db,
        "project_invitation_accepted",
        invitation["invited_by_user_id"],
        invitation_obj,
        current_user.full_name,
        getattr(current_user, "avatar_url", None)
    )
    
    return {
        "message": "Successfully joined project",
        "project_id": invitation["project_id"],
        "workspace_id": invitation["workspace_id"],
    }

@router.post("/project/{token}/decline")
async def decline_project_invitation(
    token: str,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: UserInDB = Depends(get_current_user)
):
    invitation = await _find_pending_invitation(
        db,
        "project_invitations",
        token,
        str(current_user.id),
    )
    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found or already processed")
    
    if invitation["invitee_email"] != current_user.email:
        raise HTTPException(status_code=403, detail="This invitation is not for you")
    
    await db.project_invitations.update_one(
        {"_id": invitation["_id"]},
        {"$set": {"status": "declined", "responded_at": datetime.utcnow()}}
    )
    await NotificationService.mark_action_taken(db, str(invitation["_id"]), str(current_user.id))

    invitation_obj = ProjectInvitationInDB(**_invitation_payload(invitation))
    await NotificationService.create_invitation_notification(
        db,
        "project_invitation_declined",
        invitation["invited_by_user_id"],
        invitation_obj,
        current_user.full_name,
        getattr(current_user, "avatar_url", None)
    )
    
    return {"message": "Invitation declined"}
