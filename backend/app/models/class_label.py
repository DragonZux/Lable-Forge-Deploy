from pydantic import BaseModel, Field
from datetime import datetime
from typing import List, Optional

class ClassLabelCreate(BaseModel):
    name: str
    color: str  # hex color

class ClassLabelInDB(BaseModel):
    id: str = Field(alias="_id")
    project_id: str
    name: str
    color: str
    annotation_count: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)

class ClassLabelResponse(BaseModel):
    id: str
    project_id: str
    name: str
    color: str
    annotation_count: int

class ClassLabelUpdate(BaseModel):
    name: str = None
    color: str = None

class ClassLabelMerge(BaseModel):
    source_class_ids: List[str]
    target_class_id: str
