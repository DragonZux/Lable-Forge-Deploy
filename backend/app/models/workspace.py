from pydantic import BaseModel, Field
from typing import List, Literal, Optional
from datetime import datetime

class MemberRef(BaseModel):
    user_id: str
    role: Literal["owner", "admin", "member", "viewer"]

class WorkspaceCreate(BaseModel):
    name: str

class WorkspaceInDB(BaseModel):
    id: str = Field(alias="_id")
    name: str
    owner_id: str
    plan: str = "free"
    members: List[MemberRef] = []
    created_at: datetime = Field(default_factory=datetime.utcnow)

class WorkspaceResponse(BaseModel):
    id: str
    name: str
    plan: str
    owner_id: Optional[str] = None
    member_count: int
    created_at: datetime
