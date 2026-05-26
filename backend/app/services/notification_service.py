import json
from datetime import datetime
from typing import Optional, Union

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.redis import redis_instance
from app.models.notification import (
    NotificationInDB,
    NotificationListResponse,
    NotificationResponse,
    NotificationType,
)
from app.models.project_invitation import ProjectInvitationInDB
from app.models.workspace_invitation import WorkspaceInvitationInDB


class NotificationService:
    @staticmethod
    async def create_notification(db: AsyncIOMotorDatabase, data: dict) -> NotificationInDB:
        result = await db.notifications.insert_one(data)
        data["_id"] = str(result.inserted_id)
        notification = NotificationInDB(**data)

        if redis_instance.client:
            payload = json.dumps(notification.model_dump(by_alias=True), default=str)
            await redis_instance.client.publish(f"notifications:{notification.user_id}", payload)

        return notification

    @staticmethod
    async def create_invitation_notification(
        db: AsyncIOMotorDatabase,
        notification_type: NotificationType,
        recipient_user_id: str,
        invitation: Union[WorkspaceInvitationInDB, ProjectInvitationInDB],
        actor_name: str,
        actor_avatar: Optional[str] = None,
    ) -> NotificationInDB:
        is_project_invitation = hasattr(invitation, "project_id")
        entity_name = getattr(invitation, "project_name", getattr(invitation, "workspace_name", "Unknown"))
        entity_type = "project" if is_project_invitation else "workspace"
        entity_id = getattr(invitation, "project_id", getattr(invitation, "workspace_id", ""))
        role = invitation.role

        title = ""
        body = ""

        if notification_type == "workspace_invitation_received":
            title = f"{actor_name} invited you to a workspace"
            body = f"You were invited as {role} in workspace '{entity_name}'"
        elif notification_type == "workspace_invitation_accepted":
            title = f"{actor_name} accepted the invitation"
            body = f"{actor_name} joined workspace '{entity_name}' as {role}"
        elif notification_type == "workspace_invitation_declined":
            title = f"{actor_name} declined the invitation"
            body = f"{actor_name} declined to join workspace '{entity_name}'"
        elif notification_type == "project_invitation_received":
            title = f"{actor_name} invited you to a project"
            body = f"You were invited as {role} in project '{entity_name}'"
        elif notification_type == "project_invitation_accepted":
            title = f"{actor_name} accepted the invitation"
            body = f"{actor_name} joined project '{entity_name}' as {role}"
        elif notification_type == "project_invitation_declined":
            title = f"{actor_name} declined the invitation"
            body = f"{actor_name} declined to join project '{entity_name}'"

        notification_data = {
            "user_id": recipient_user_id,
            "type": notification_type,
            "title": title,
            "body": body,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "entity_name": entity_name,
            "invitation_id": invitation.id,
            "token": getattr(invitation, "token", None),
            "actor_name": actor_name,
            "actor_avatar": actor_avatar,
            "is_read": False,
            "action_required": "_received" in notification_type,
            "action_taken": False,
            "created_at": datetime.utcnow(),
        }

        return await NotificationService.create_notification(db, notification_data)

    @staticmethod
    async def get_user_notifications(
        db: AsyncIOMotorDatabase,
        user_id: str,
        page: int = 1,
        limit: int = 20,
        unread_only: bool = False,
    ) -> NotificationListResponse:
        query = {"user_id": user_id}
        if unread_only:
            query["is_read"] = False

        total = await db.notifications.count_documents(query)
        cursor = db.notifications.find(query).sort("created_at", -1).skip((page - 1) * limit).limit(limit)

        notifications = []
        async for doc in cursor:
            doc["id"] = str(doc["_id"])
            notifications.append(NotificationResponse(**doc))

        unread_count = await db.notifications.count_documents({"user_id": user_id, "is_read": False})

        return NotificationListResponse(
            notifications=notifications,
            total=total,
            unread_count=unread_count,
        )

    @staticmethod
    async def mark_as_read(db: AsyncIOMotorDatabase, notification_id: str, user_id: str) -> bool:
        result = await db.notifications.update_one(
            {"_id": ObjectId(notification_id), "user_id": user_id},
            {"$set": {"is_read": True}},
        )
        return result.matched_count > 0

    @staticmethod
    async def mark_all_as_read(db: AsyncIOMotorDatabase, user_id: str) -> int:
        result = await db.notifications.update_many(
            {"user_id": user_id, "is_read": False},
            {"$set": {"is_read": True}},
        )
        return result.modified_count

    @staticmethod
    async def mark_action_taken(db: AsyncIOMotorDatabase, invitation_id: str, user_id: str) -> bool:
        result = await db.notifications.update_many(
            {"invitation_id": invitation_id, "user_id": user_id},
            {"$set": {"action_taken": True, "is_read": True}},
        )
        return result.modified_count > 0
