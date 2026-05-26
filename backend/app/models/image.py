from pydantic import BaseModel, Field
from typing import Literal, Optional
from datetime import datetime

ImageSplit = Literal["train", "valid", "test", "unassigned"]
ImageStatus = Literal["uploaded", "annotated", "unannotated", "needs_review", "approved", "rejected"]
AnnotationStatus = Literal["annotated", "unannotated"]
ReviewStatus = Literal["none", "needs_review", "approved", "rejected"]
AssignmentStatus = Literal["unassigned", "assigned", "in_progress", "done"]

class ImageInDB(BaseModel):
    id: str = Field(alias="_id")
    project_id: str
    filename: str
    original_filename: str
    url: str
    width: int
    height: int
    split: ImageSplit = "unassigned"
    status: ImageStatus = "uploaded"
    annotation_status: AnnotationStatus = "unannotated"
    review_status: ReviewStatus = "none"
    assigned_to_user_id: Optional[str] = None
    assigned_by_user_id: Optional[str] = None
    assigned_at: Optional[datetime] = None
    due_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    assignment_status: AssignmentStatus = "unassigned"
    reviewer_id: Optional[str] = None
    reviewer_comment: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class ImageResponse(BaseModel):
    id: str
    project_id: str
    filename: str
    original_filename: str
    url: str
    width: int
    height: int
    split: ImageSplit
    status: ImageStatus
    annotation_status: AnnotationStatus = "unannotated"
    review_status: ReviewStatus = "none"
    assigned_to_user_id: Optional[str] = None
    assigned_by_user_id: Optional[str] = None
    assigned_at: Optional[datetime] = None
    due_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    assignment_status: AssignmentStatus = "unassigned"
    reviewer_id: Optional[str] = None
    reviewer_comment: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    created_at: datetime
