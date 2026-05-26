from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class PreprocessingConfig(BaseModel):
    resize: Optional[int] = None
    grayscale: bool = False
    auto_orient: bool = False

class AugmentationConfig(BaseModel):
    flip_horizontal: bool = False
    flip_vertical: bool = False
    rotation: int = 0
    brightness: float = 0.0
    blur: float = 0.0
    noise: float = 0.0

class DatasetVersionCreate(BaseModel):
    preprocessing: PreprocessingConfig
    augmentation: AugmentationConfig
    train_percent: int
    valid_percent: int
    test_percent: int

class DatasetVersionInDB(BaseModel):
    id: str = Field(alias="_id")
    project_id: str
    version_number: int
    preprocessing: PreprocessingConfig
    augmentation: AugmentationConfig
    train_count: int
    valid_count: int
    test_count: int
    status: str = "ready"
    processing_progress: int = 0
    zip_url: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class DatasetVersionResponse(BaseModel):
    id: str
    project_id: str
    version_number: int
    preprocessing: PreprocessingConfig
    augmentation: AugmentationConfig
    train_count: int
    valid_count: int
    test_count: int
    status: str
    processing_progress: int = 0
    zip_url: Optional[str] = None
    created_at: datetime
