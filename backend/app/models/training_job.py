from pydantic import BaseModel, Field
from typing import Any, Dict, List, Literal, Optional
from datetime import datetime

TrainingJobStatus = Literal["queued", "preparing", "training", "evaluating", "done", "failed", "awaiting_colab"]
TrainingBackend = Literal["local", "colab", "kaggle"]

class TrainingJobInDB(BaseModel):
    id: str = Field(alias="_id")
    project_id: str
    dataset_version_id: str
    status: TrainingJobStatus = "queued"
    training_backend: TrainingBackend = "local"
    map_score: Optional[float] = None
    precision: Optional[float] = None
    recall: Optional[float] = None
    epochs_completed: int = 0
    total_epochs: int = 50
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    error_message: Optional[str] = None
    artifact_url: Optional[str] = None
    training_config: Dict[str, Any] = Field(default_factory=dict)
    metrics_history: List[Dict[str, Any]] = Field(default_factory=list)
    confusion_matrix: Optional[Dict[str, Any]] = None
    sample_predictions: List[Dict[str, Any]] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)

class TrainingJobResponse(BaseModel):
    id: str
    project_id: str
    dataset_version_id: str
    status: TrainingJobStatus
    training_backend: TrainingBackend
    map_score: Optional[float]
    precision: Optional[float]
    recall: Optional[float]
    epochs_completed: int
    total_epochs: int
    started_at: Optional[datetime]
    finished_at: Optional[datetime]
    error_message: Optional[str] = None
    artifact_url: Optional[str] = None
    training_config: Dict[str, Any] = Field(default_factory=dict)
    metrics_history: List[Dict[str, Any]] = Field(default_factory=list)
    confusion_matrix: Optional[Dict[str, Any]] = None
    sample_predictions: List[Dict[str, Any]] = Field(default_factory=list)
    created_at: datetime
