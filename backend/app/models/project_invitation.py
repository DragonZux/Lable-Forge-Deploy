from pydantic import BaseModel, EmailStr, Field, ConfigDict
from typing import Optional, Literal
from datetime import datetime
from .workspace_invitation import InvitationStatus

ProjectRole = Literal["admin", "annotator", "reviewer", "viewer"]

class ProjectInvitationCreate(BaseModel):
    email: EmailStr
    role: ProjectRole
    message: Optional[str] = ""

class ProjectInvitationInDB(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(alias="_id")
    project_id: str
    project_name: str            # denormalized
    workspace_id: str            # project belongs to which workspace
    invited_by_user_id: str
    invited_by_name: str
    invited_by_avatar: Optional[str] = None
    invitee_email: EmailStr
    invitee_user_id: Optional[str] = None
    role: ProjectRole
    status: InvitationStatus = "pending"
    token: str
    message: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    expires_at: datetime
    responded_at: Optional[datetime] = None

class ProjectInvitationResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    project_id: str
    project_name: str
    invited_by_name: str
    invited_by_avatar: Optional[str] = None
    invitee_email: str
    role: ProjectRole
    status: InvitationStatus
    message: Optional[str] = None
    created_at: datetime
    expires_at: datetime
