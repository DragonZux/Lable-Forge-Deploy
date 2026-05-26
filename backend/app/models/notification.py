from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, Literal, List
from datetime import datetime

NotificationType = Literal[
    "workspace_invitation_received",   # invitee receives workspace invite
    "workspace_invitation_accepted",   # inviter notified of acceptance
    "workspace_invitation_declined",   # inviter notified of declination
    "project_invitation_received",     # invitee receives project invite
    "project_invitation_accepted",
    "project_invitation_declined",
]

class NotificationInDB(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(alias="_id")
    user_id: str                 # recipient of this notification
    type: NotificationType
    title: str
    body: str
    entity_type: Literal["workspace", "project"]
    entity_id: str               # workspace_id or project_id
    entity_name: str
    invitation_id: str           # id of the related invitation
    token: Optional[str] = None  # token for accepting/declining
    actor_name: str              # person who performed the action
    actor_avatar: Optional[str] = None
    is_read: bool = False
    action_required: bool        # True if it's an invitation_received
    action_taken: bool = False   # True after user has processed it
    created_at: datetime = Field(default_factory=datetime.utcnow)

class NotificationResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    type: NotificationType
    title: str
    body: str
    entity_type: str
    entity_id: str
    entity_name: str
    invitation_id: str
    token: Optional[str] = None
    actor_name: str
    actor_avatar: Optional[str] = None
    is_read: bool
    action_required: bool
    action_taken: bool
    created_at: datetime

class NotificationListResponse(BaseModel):
    notifications: List[NotificationResponse]
    total: int
    unread_count: int
