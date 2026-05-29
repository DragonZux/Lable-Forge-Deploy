"""
Deploy router - Deploy trained models and run inference.
Protected endpoints: all require authentication.
"""

import secrets
import time
import os
import tempfile
import requests
from botocore.exceptions import ClientError
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Header, status
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase
from PIL import Image
import io

from ..models.deployed_model import (
    DeployedModelResponse,
    InferenceResponse,
    PredictionResult,
)
from ..models.user import UserInDB
from ..utils.auth import get_current_user
from ..core.database import get_database
from ..core.redis import get_redis
from ..core.storage import storage_client
from ..routers.projects import check_project_access
from ..routers.images import ALLOWED_IMAGE_TYPES, _detect_image_content_type

router = APIRouter(prefix="/deploy", tags=["Deploy"])

_MODEL_CACHE: dict[str, object] = {}


def _deployed_model_to_response(model: dict, include_api_key: bool = False) -> DeployedModelResponse:
    """Convert MongoDB deployed model to response."""
    return DeployedModelResponse(
        id=str(model["_id"]),
        project_id=model["project_id"],
        training_job_id=model["training_job_id"],
        api_key=model["api_key"] if include_api_key else None,
        api_endpoint=model.get("api_endpoint", f"/api/deploy/{str(model['_id'])}/predict"),
        status=model.get("status", "active"),
        artifact_url=model.get("artifact_url"),
        metrics_snapshot=model.get("metrics_snapshot"),
        created_at=model.get("created_at"),
    )


def _can_view_api_key(user: UserInDB, project: dict, workspace: dict) -> bool:
    user_id = str(user.id)
    workspace_member = next(
        (m for m in workspace.get("members", []) if m["user_id"] == user_id),
        None,
    )
    project_member = next(
        (m for m in project.get("members", []) if m["user_id"] == user_id),
        None,
    )
    return bool(
        workspace_member and workspace_member.get("role") in ["owner", "admin"]
    ) or bool(project_member and project_member.get("role") == "admin")


def _artifact_key_from_url(artifact_url: Optional[str]) -> str:
    if not artifact_url:
        raise HTTPException(status_code=400, detail="Model artifact is missing")
    if artifact_url.startswith("minio://"):
        return artifact_url.replace("minio://", "", 1)
    if artifact_url.startswith("model-artifacts/"):
        return artifact_url
    raise HTTPException(
        status_code=400,
        detail="Only MinIO model artifacts can be used for hosted inference",
    )


def _artifact_exists(artifact_url: Optional[str]) -> bool:
    try:
        artifact_key = _artifact_key_from_url(artifact_url)
        storage_client.s3.head_object(Bucket=storage_client.bucket, Key=artifact_key)
        return True
    except HTTPException:
        raise
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code")
        if code in {"404", "NoSuchKey", "NotFound"}:
            return False
        raise


def _ensure_hosted_artifact(
    training_job_id: str,
    artifact_url: Optional[str],
    workspace_id: str = "default_workspace",
    project_id: str = "default_project",
) -> str:
    if not artifact_url:
        raise HTTPException(status_code=400, detail="Model artifact is missing")
    if artifact_url.startswith("minio://"):
        if not _artifact_exists(artifact_url):
            raise HTTPException(
                status_code=400,
                detail="Model artifact file is missing from storage. Retrain the model and deploy it again.",
            )
        return artifact_url
    if artifact_url.startswith(("http://", "https://")):
        try:
            response = requests.get(artifact_url, timeout=120)
            response.raise_for_status()
        except requests.RequestException as exc:
            raise HTTPException(
                status_code=400,
                detail=f"Failed to download external model artifact: {exc}",
            ) from exc

        artifact_key = f"workspaces/{workspace_id}/projects/{project_id}/model-artifacts/{training_job_id}/best.pt"
        storage_client.upload_file(
            file_bytes=response.content,
            filename=artifact_key,
            content_type="application/octet-stream",
        )
        return f"minio://{artifact_key}"
    raise HTTPException(
        status_code=400,
        detail="This training job does not have a deployable YOLO artifact. Retrain before deploying.",
    )


def _load_yolo_model(model: dict):
    from ultralytics import YOLO

    model_id = str(model["_id"])
    artifact_url = model.get("artifact_url")
    cache_key = f"{model_id}:{artifact_url}"
    cached_model = _MODEL_CACHE.get(cache_key)
    if cached_model is not None:
        return cached_model

    artifact_key = _artifact_key_from_url(artifact_url)
    model_dir = os.path.join(tempfile.gettempdir(), "labelforge_models", model_id)
    os.makedirs(model_dir, exist_ok=True)
    local_model_path = os.path.join(model_dir, "best.pt")

    if not os.path.exists(local_model_path):
        try:
            model_bytes = storage_client.download_file(artifact_key)
        except ClientError as exc:
            code = exc.response.get("Error", {}).get("Code")
            if code in {"404", "NoSuchKey", "NotFound"}:
                raise HTTPException(
                    status_code=400,
                    detail="Model artifact file is missing from storage. Retrain the model and deploy it again.",
                ) from exc
            raise
        with open(local_model_path, "wb") as model_file:
            model_file.write(model_bytes)

    yolo_model = YOLO(local_model_path)
    _MODEL_CACHE[cache_key] = yolo_model
    return yolo_model


async def _run_yolo_inference(
    model_id: str,
    model: dict,
    contents: bytes,
    db: AsyncIOMotorDatabase,
) -> InferenceResponse:
    detected_content_type = _detect_image_content_type(contents)
    if detected_content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported or invalid image type")

    try:
        image = Image.open(io.BytesIO(contents))
        image.verify()
        image = Image.open(io.BytesIO(contents)).convert("RGB")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid image file")

    start_time = time.time()
    yolo_model = _load_yolo_model(model)
    job = None
    training_job_id = model.get("training_job_id")
    if training_job_id and training_job_id != "imported" and ObjectId.is_valid(training_job_id):
        job = await db.training_jobs.find_one({"_id": ObjectId(training_job_id)})
    training_config = job.get("training_config", {}) if job else {}
    confidence = float(training_config.get("confidence_threshold", 0.25))

    results = yolo_model.predict(image, conf=confidence, verbose=False)
    names = getattr(yolo_model, "names", {}) or {}
    predictions: list[PredictionResult] = []
    for result in results:
        boxes = getattr(result, "boxes", None)
        if boxes is None:
            continue
        for box in boxes:
            cls_idx = int(box.cls[0].item())
            xywhn = box.xywhn[0].tolist()
            x = max(0.0, min(1.0, float(xywhn[0] - xywhn[2] / 2)))
            y = max(0.0, min(1.0, float(xywhn[1] - xywhn[3] / 2)))
            width = max(0.0, min(1.0 - x, float(xywhn[2])))
            height = max(0.0, min(1.0 - y, float(xywhn[3])))

            bbox = {
                "x": round(x, 6),
                "y": round(y, 6),
                "width": round(width, 6),
                "height": round(height, 6),
            }
            predictions.append(
                PredictionResult(
                    class_name=names.get(cls_idx, str(cls_idx)),
                    confidence=round(float(box.conf[0].item()), 6),
                    bbox=bbox,
                )
            )

    return InferenceResponse(
        model_id=model_id,
        predictions=predictions,
        processing_time_ms=round((time.time() - start_time) * 1000, 2),
    )


@router.post("", status_code=201)
async def deploy_model(
    project_id: str = Query(...),
    payload: dict = None,
    user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
    redis=Depends(get_redis),
) -> DeployedModelResponse:
    """
    Deploy a trained model.
    Body: {"training_job_id": str}
    Only deploys if job status is "done".
    """
    # Get project
    try:
        project_oid = ObjectId(project_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid project ID")

    project = await db.projects.find_one({"_id": project_oid})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Check access
    await check_project_access(user, project, db, "admin")

    if not payload:
        raise HTTPException(status_code=400, detail="training_job_id required")

    # Validate training job exists and belongs to this project
    training_job_id = payload.get("training_job_id")
    try:
        job_oid = ObjectId(training_job_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid training job ID")

    job = await db.training_jobs.find_one({"_id": job_oid})
    if not job:
        raise HTTPException(status_code=404, detail="Training job not found")
    if job.get("project_id") != project_id:
        raise HTTPException(status_code=404, detail="Training job not found")

    # Check job status
    if job["status"] != "done":
        raise HTTPException(
            status_code=400,
            detail=f"Can only deploy completed jobs (current status: {job['status']})",
        )
    workspace_id = project.get("workspace_id", "default_workspace")
    artifact_url = _ensure_hosted_artifact(
        training_job_id,
        job.get("artifact_url"),
        workspace_id=workspace_id,
        project_id=project_id,
    )
    if artifact_url != job.get("artifact_url"):
        await db.training_jobs.update_one(
            {"_id": job_oid},
            {"$set": {"artifact_url": artifact_url}},
        )

    # Create deployed model
    api_key = secrets.token_urlsafe(32)
    model_id = ObjectId()
    now = datetime.utcnow()

    model_doc = {
        "_id": model_id,
        "project_id": project_id,
        "training_job_id": training_job_id,
        "api_key": api_key,
        "api_endpoint": f"/api/deploy/{str(model_id)}/predict",
        "status": "active",
        "artifact_url": artifact_url,
        "metrics_snapshot": {
            "map_score": job.get("map_score"),
            "precision": job.get("precision"),
            "recall": job.get("recall"),
        },
        "created_at": now,
    }

    await db.deployed_models.insert_one(model_doc)

    # Invalidate cache
    await redis.delete(f"deploy:project:{project_id}:keys:0")
    await redis.delete(f"deploy:project:{project_id}:keys:1")

    return _deployed_model_to_response(model_doc, include_api_key=True)


@router.post("/import", status_code=201)
async def import_model(
    project_id: str = Query(...),
    file: UploadFile = File(...),
    user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
    redis=Depends(get_redis),
) -> DeployedModelResponse:
    """
    Import/upload a custom trained YOLO model file (.pt) and deploy it.
    """
    try:
        project_oid = ObjectId(project_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid project ID")

    project = await db.projects.find_one({"_id": project_oid})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    await check_project_access(user, project, db, "admin")

    filename = file.filename or ""
    if not (filename.lower().endswith(".pt") or filename.lower().endswith(".pth") or filename.lower().endswith(".onnx")):
        raise HTTPException(
            status_code=400,
            detail="Invalid model file. Only PyTorch YOLO weights (.pt) are supported.",
        )

    model_id = ObjectId()
    contents = await file.read()
    workspace_id = project.get("workspace_id", "default_workspace")
    artifact_key = f"workspaces/{workspace_id}/projects/{project_id}/model-artifacts/imported-{str(model_id)}/best.pt"

    try:
        storage_client.upload_file(
            file_bytes=contents,
            filename=artifact_key,
            content_type="application/octet-stream",
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to upload model weights to storage: {exc}",
        )

    api_key = secrets.token_urlsafe(32)
    now = datetime.utcnow()

    model_doc = {
        "_id": model_id,
        "project_id": project_id,
        "training_job_id": "imported",
        "api_key": api_key,
        "api_endpoint": f"/api/deploy/{str(model_id)}/predict",
        "status": "active",
        "artifact_url": f"minio://{artifact_key}",
        "metrics_snapshot": None,
        "created_at": now,
    }

    await db.deployed_models.insert_one(model_doc)

    await redis.delete(f"deploy:project:{project_id}:keys:0")
    await redis.delete(f"deploy:project:{project_id}:keys:1")

    return _deployed_model_to_response(model_doc, include_api_key=True)


@router.get("")
async def list_deployed_models(
    project_id: str = Query(...),
    user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
    redis=Depends(get_redis),
) -> List[DeployedModelResponse]:
    """Get all deployed models for a project."""
    # Get project
    try:
        project_oid = ObjectId(project_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid project ID")

    project = await db.projects.find_one({"_id": project_oid})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Check access
    workspace = await check_project_access(user, project, db, "viewer")
    include_api_key = _can_view_api_key(user, project, workspace)

    # Try cache. API key visibility depends on caller role, so keep cache entries separate.
    cache_key = f"deploy:project:{project_id}:keys:{int(include_api_key)}"
    cached = await redis.get(cache_key)
    if cached:
        import json

        return [
            DeployedModelResponse(**m)
            for m in json.loads(cached)
        ]

    # Fetch from DB
    models = await db.deployed_models.find(
        {"project_id": project_id, "status": "active"}
    ).sort("created_at", -1).to_list(None)

    responses = [_deployed_model_to_response(m, include_api_key=include_api_key) for m in models]

    # Cache
    import json

    await redis.setex(
        cache_key,
        300,
        json.dumps([m.model_dump(mode="json") for m in responses]),
    )

    return responses


@router.post("/{model_id}/test")
async def test_model_inference(
    model_id: str,
    file: UploadFile = File(...),
    user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> InferenceResponse:
    """Test deployed model with an image."""
    try:
        model_oid = ObjectId(model_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid model ID")

    model = await db.deployed_models.find_one({"_id": model_oid})
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")

    # Check access
    project = await db.projects.find_one({"_id": ObjectId(model["project_id"])})
    await check_project_access(user, project, db, "reviewer")

    contents = await file.read()
    return await _run_yolo_inference(model_id, model, contents, db)


@router.post("/{model_id}/predict")
async def predict_with_deployed_model(
    model_id: str,
    file: UploadFile = File(...),
    authorization: Optional[str] = Header(None),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> InferenceResponse:
    """
    Public inference endpoint for deployed models.
    Requires Authorization: Bearer <model api_key>.
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing API key",
            headers={"WWW-Authenticate": "Bearer"},
        )

    api_key = authorization.split(" ", 1)[1].strip()
    try:
        model_oid = ObjectId(model_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid model ID")

    model = await db.deployed_models.find_one(
        {"_id": model_oid, "api_key": api_key, "status": "active"}
    )
    if not model:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key or model",
            headers={"WWW-Authenticate": "Bearer"},
    )

    contents = await file.read()
    return await _run_yolo_inference(model_id, model, contents, db)
