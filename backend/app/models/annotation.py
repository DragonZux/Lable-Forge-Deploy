from pydantic import BaseModel, Field
from typing import List, Tuple, Dict, Literal, Optional
from datetime import datetime

AnnotationType = Literal[
    "bbox",
    "polygon",
    "polyline",
    "points",
    "ellipse",
    "cuboid",
    "mask",
    "skeleton",
    "tag",
    "classification",
]

class BBoxCoordinates(BaseModel):
    x: float
    y: float
    width: float
    height: float

class PolygonCoordinates(BaseModel):
    points: List[Tuple[float, float]]

class AnnotationCreate(BaseModel):
    image_id: str
    class_id: str
    class_name: str
    type: AnnotationType
    coordinates: Dict

class AnnotationInDB(BaseModel):
    id: str = Field(alias="_id")
    image_id: str
    project_id: str
    created_by_user_id: Optional[str] = None
    class_id: str
    class_name: str
    type: AnnotationType
    coordinates: Dict
    created_at: datetime = Field(default_factory=datetime.utcnow)

class AnnotationResponse(BaseModel):
    id: str
    image_id: str
    project_id: str
    created_by_user_id: Optional[str] = None
    class_id: str
    class_name: str
    type: AnnotationType
    coordinates: Dict
    created_at: datetime
