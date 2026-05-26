from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List
from datetime import datetime

class DeployedModelCreate(BaseModel):
    training_job_id: str

class DeployedModelInDB(BaseModel):
    id: str = Field(alias="_id")
    project_id: str
    training_job_id: str
    api_key: str
    api_endpoint: str
    status: str = "active"
    created_at: datetime = Field(default_factory=datetime.utcnow)

class DeployedModelResponse(BaseModel):
    id: str
    project_id: str
    training_job_id: str
    api_key: Optional[str] = None
    api_endpoint: str
    status: str
    artifact_url: Optional[str] = None
    metrics_snapshot: Optional[dict] = None
    created_at: datetime

class InferenceRequest(BaseModel):
    image_url: Optional[str] = None
    # image_bytes would be handled via multipart

class PredictionResult(BaseModel):
    class_name: str
    confidence: float
    bbox: Optional[dict] = None

class InferenceResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    model_id: str
    predictions: List[PredictionResult]
    processing_time_ms: float
