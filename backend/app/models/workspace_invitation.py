from pydantic import BaseModel, EmailStr, Field, ConfigDict
from typing import Optional, Literal
from datetime import datetime

InvitationStatus = Literal["pending", "accepted", "declined", "expired", "cancelled"]
WorkspaceRole = Literal["admin", "member", "viewer"]

class WorkspaceInvitationCreate(BaseModel):
    email: EmailStr
    role: WorkspaceRole
    message: Optional[str] = None

class WorkspaceInvitationInDB(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(alias="_id")
    workspace_id: str
    workspace_name: str          # denormalized for email/notification
    invited_by_user_id: str
    invited_by_name: str         # denormalized
    invited_by_avatar: Optional[str] = None
    invitee_email: EmailStr
    invitee_user_id: Optional[str] = None  # None if email has no account yet
    role: WorkspaceRole
    status: InvitationStatus = "pending"
    token: str                   # UUID token for email link
    message: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    expires_at: datetime         # created_at + 7 days
    responded_at: Optional[datetime] = None

class WorkspaceInvitationResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    workspace_id: str
    workspace_name: str
    invited_by_name: str
    invited_by_avatar: Optional[str] = None
    invitee_email: str
    role: WorkspaceRole
    status: InvitationStatus
    message: Optional[str] = None
    created_at: datetime
    expires_at: datetime
