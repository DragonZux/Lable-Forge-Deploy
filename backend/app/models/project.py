from pydantic import BaseModel, Field
from typing import Literal, Optional, List
from datetime import datetime

ProjectType = Literal["object-detection", "classification", "instance-segmentation", "semantic-segmentation"]

class ProjectCreate(BaseModel):
    name: str
    type: ProjectType
    description: str = ""
    initial_class_labels: List[str] = []

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[ProjectType] = None
    description: Optional[str] = None

class ProjectMemberRef(BaseModel):
    user_id: str
    role: Literal["admin", "annotator", "reviewer", "viewer"]
    joined_at: datetime = Field(default_factory=datetime.utcnow)

class ProjectMemberUpdate(BaseModel):
    role: Literal["admin", "annotator", "reviewer", "viewer"]

class ProjectMemberResponse(BaseModel):
    user_id: str
    email: str
    full_name: str
    role: str
    joined_at: datetime

class ProjectInDB(BaseModel):
    id: str = Field(alias="_id")
    workspace_id: str
    name: str
    type: ProjectType
    description: str = ""
    image_count: int = 0
    annotation_count: int = 0
    members: List[ProjectMemberRef] = []
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class ProjectResponse(BaseModel):
    id: str
    workspace_id: str
    name: str
    type: ProjectType
    description: str
    image_count: int
    annotation_count: int
    member_count: int = 0
    members: List[ProjectMemberResponse] = []
    created_at: datetime
    updated_at: datetime
