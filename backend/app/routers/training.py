"""
Training router - Launch and manage training jobs.
Protected endpoints: all require authentication.
"""

from datetime import datetime
import json
import os
import logging
import io
import tempfile
from typing import List
from urllib.parse import quote
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from bson import ObjectId
from botocore.exceptions import ClientError
from motor.motor_asyncio import AsyncIOMotorDatabase
import asyncio
from PIL import Image

from ..models.training_job import TrainingJobResponse
from ..models.user import UserInDB
from ..utils.auth import get_current_user
from ..core.database import get_database
from ..core.redis import get_redis
from ..core.config import settings, get_active_backend_url
from ..core.storage import storage_client
from ..routers.projects import check_project_access

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/training", tags=["Training"])

TRAINING_DEFAULTS = {
    "architecture": "yolov8s",
    "epochs": 50,
    "batch_size": 16,
    "image_size": 640,
    "learning_rate": 0.006,
    "patience": 12,
    "confidence_threshold": 0.25,
}


def _coerce_training_config(raw_config: dict | None) -> dict:
    raw_config = raw_config or {}
    config = TRAINING_DEFAULTS.copy()

    architecture = raw_config.get("architecture", config["architecture"])
    if architecture not in {"yolov8n", "yolov8s", "yolov8m", "yolov8l", "yolov8x"}:
        architecture = config["architecture"]
    config["architecture"] = architecture

    int_bounds = {
        "epochs": (1, 300),
        "batch_size": (1, 64),
        "image_size": (320, 1280),
        "patience": (0, 100),
    }
    for key, (minimum, maximum) in int_bounds.items():
        try:
            value = int(raw_config.get(key, config[key]))
        except Exception:
            value = config[key]
        config[key] = max(minimum, min(maximum, value))

    float_bounds = {
        "learning_rate": (0.00001, 1.0),
        "confidence_threshold": (0.01, 0.95),
    }
    for key, (minimum, maximum) in float_bounds.items():
        try:
            value = float(raw_config.get(key, config[key]))
        except Exception:
            value = config[key]
        config[key] = max(minimum, min(maximum, value))

    return config


def _serialize_job_for_pub_sub(job: dict) -> str:
    """Convert job document to JSON string for Redis Pub/Sub."""
    job_copy = job.copy()
    job_copy["_id"] = str(job_copy["_id"])
    if job_copy.get("created_at"):
        job_copy["created_at"] = job_copy["created_at"].isoformat()
    if job_copy.get("started_at"):
        job_copy["started_at"] = job_copy["started_at"].isoformat()
    if job_copy.get("finished_at"):
        job_copy["finished_at"] = job_copy["finished_at"].isoformat()
    return json.dumps(job_copy)


def _minio_artifact_exists(model_url: str | None) -> bool:
    if not model_url or not model_url.startswith("minio://"):
        return False
    artifact_key = model_url.replace("minio://", "", 1)
    try:
        storage_client.s3.head_object(Bucket=storage_client.bucket, Key=artifact_key)
        return True
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code")
        if code in {"404", "NoSuchKey", "NotFound"}:
            return False
        raise


def _artifact_key_from_url(model_url: str | None) -> str:
    if not model_url:
        raise HTTPException(status_code=400, detail="Model artifact is missing")
    if model_url.startswith("minio://"):
        return model_url.replace("minio://", "", 1)
    if model_url.startswith("model-artifacts/"):
        return model_url
    raise HTTPException(status_code=400, detail="Only MinIO model artifacts can be used for auto-labeling")


def _training_job_to_response(job: dict) -> TrainingJobResponse:
    """Convert MongoDB training job document to TrainingJobResponse."""
    return TrainingJobResponse(
        id=str(job["_id"]),
        project_id=job["project_id"],
        dataset_version_id=job["dataset_version_id"],
        status=job.get("status", "queued"),
        training_backend=job.get("training_backend", "local"),
        map_score=job.get("map_score"),
        precision=job.get("precision"),
        recall=job.get("recall"),
        epochs_completed=job.get("epochs_completed", 0),
        total_epochs=job.get("total_epochs", 50),
        started_at=job.get("started_at"),
        finished_at=job.get("finished_at"),
        created_at=job.get("created_at"),
        error_message=job.get("error_message"),
        artifact_url=job.get("artifact_url"),
        training_config=job.get("training_config", {}),
        metrics_history=job.get("metrics_history", []),
        confusion_matrix=job.get("confusion_matrix"),
        sample_predictions=job.get("sample_predictions", []),
    )


@router.post("", status_code=201)
async def create_training_job(
    project_id: str = Query(...),
    payload: dict = None,
    user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
    redis=Depends(get_redis),
) -> TrainingJobResponse:
    """
    Launch a new training job.
    Body: {
        "dataset_version_id": str,
        "backend": "local" | "colab" (optional, default: local)
    }
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
        raise HTTPException(status_code=400, detail="dataset_version_id required")

    # Validate dataset version exists and belongs to this project
    dataset_version_id = payload.get("dataset_version_id")
    try:
        version_oid = ObjectId(dataset_version_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid dataset version ID")

    version = await db.dataset_versions.find_one({"_id": version_oid})
    if not version:
        raise HTTPException(status_code=404, detail="Dataset version not found")
    if version.get("project_id") != project_id:
        raise HTTPException(status_code=404, detail="Dataset version not found")

    # Get backend choice
    training_backend = payload.get("backend", "colab")
    if training_backend not in ["colab", "kaggle"]:
        raise HTTPException(status_code=400, detail="Invalid backend. Must be 'colab' or 'kaggle'")

    if training_backend == "kaggle":
        kaggle_username = getattr(user, "kaggle_username", None)
        kaggle_key = getattr(user, "kaggle_key", None)
        if not kaggle_username or not kaggle_key:
            raise HTTPException(
                status_code=400,
                detail="Kaggle API credentials not found. Please navigate to Settings to link your Kaggle Account first."
            )

    training_config = _coerce_training_config(payload.get("training_config"))

    # Create training job
    now = datetime.utcnow()
    job_doc = {
        "project_id": project_id,
        "dataset_version_id": dataset_version_id,
        "status": "queued",
        "training_backend": training_backend,
        "map_score": None,
        "precision": None,
        "recall": None,
        "epochs_completed": 0,
        "total_epochs": training_config["epochs"],
        "training_config": training_config,
        "started_at": None,
        "finished_at": None,
        "error_message": None,
        "artifact_url": None,
        "metrics_history": [],
        "confusion_matrix": None,
        "sample_predictions": [],
        "created_at": now,
    }

    result = await db.training_jobs.insert_one(job_doc)
    job_doc["_id"] = result.inserted_id

    # Queue based on backend
    if training_backend == "colab":
        # Colab: keep status as queued, will generate link on demand
        pass
    elif training_backend == "kaggle":
        # Kaggle: run automated headless push task in the background
        from ..services.kaggle_service import launch_kaggle_headless_job
        
        backend_url = get_active_backend_url()
        backend_url = backend_url.rstrip("/")
        dataset_url = f"{backend_url}/api/versions/{dataset_version_id}/download"
        callback_url = f"{backend_url}/api/training/{result.inserted_id}/colab-callback"
        
        params = {
            "JOB_ID": str(result.inserted_id),
            "DATASET_URL": dataset_url,
            "CALLBACK_URL": callback_url,
            "ARCHITECTURE": training_config["architecture"],
            "EPOCHS": str(training_config["epochs"]),
            "IMAGE_SIZE": str(training_config["image_size"]),
            "BATCH_SIZE": str(training_config["batch_size"]),
            "LEARNING_RATE": str(training_config["learning_rate"]),
            "PATIENCE": str(training_config["patience"]),
            "CONFIDENCE_THRESHOLD": str(training_config["confidence_threshold"]),
        }
        
        await db.training_jobs.update_one(
            {"_id": result.inserted_id},
            {
                "$set": {
                    "status": "preparing",
                    "started_at": datetime.utcnow()
                }
            }
        )
        
        # Launch in background async task so endpoint returns immediately
        async def run_kaggle_push():
            res = await launch_kaggle_headless_job(
                user_kaggle_username=kaggle_username,
                user_kaggle_key=kaggle_key,
                job_id=str(result.inserted_id),
                params=params
            )
            if res["status"] == "success":
                await db.training_jobs.update_one(
                    {"_id": result.inserted_id},
                    {
                        "$set": {
                            "status": "training",
                            "started_at": datetime.utcnow(),
                            "artifact_url": f"Kaggle: {res['kaggle_url']}"
                        }
                    }
                )
            else:
                await db.training_jobs.update_one(
                    {"_id": result.inserted_id},
                    {
                        "$set": {
                            "status": "failed",
                            "error_message": f"Kaggle automated launch failed: {res['error']}",
                            "finished_at": datetime.utcnow()
                        }
                    }
                )
            # Invalidate redis cache and trigger pubsub updates
            await redis.delete(f"training:project:{project_id}")
            channel = f"job:{result.inserted_id}"
            updated_job = await db.training_jobs.find_one({"_id": result.inserted_id})
            await redis.publish(channel, _serialize_job_for_pub_sub(updated_job))
            
        asyncio.create_task(run_kaggle_push())
    else:
        # Fallback safety (local compute is disabled)
        pass

    # Invalidate cache
    cache_key = f"training:project:{project_id}"
    await redis.delete(cache_key)

    return _training_job_to_response(job_doc)


@router.post("/{job_id}/auto-label")
async def auto_label_untrained_images(
    job_id: str,
    payload: dict | None = None,
    user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
    redis=Depends(get_redis),
) -> dict:
    """Use a completed training job to annotate selected or non-train unannotated images."""
    try:
        job_oid = ObjectId(job_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid job ID")

    job = await db.training_jobs.find_one({"_id": job_oid})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.get("status") != "done":
        raise HTTPException(status_code=400, detail="Training must be completed before auto-labeling")

    project_id = job["project_id"]
    project = await db.projects.find_one({"_id": ObjectId(project_id)})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    await check_project_access(user, project, db, "admin")

    from ultralytics import YOLO

    project_type = project.get("type")
    if project_type not in {"object-detection", "classification"}:
        raise HTTPException(status_code=400, detail="Auto annotation is not available for this project type")

    payload = payload or {}
    requested_image_ids = payload.get("image_ids") or []
    replace_existing = bool(payload.get("replace_existing", False))

    image_query: dict = {"project_id": project_id}
    if requested_image_ids:
        valid_oids = []
        for image_id in requested_image_ids:
            if ObjectId.is_valid(str(image_id)):
                valid_oids.append(ObjectId(str(image_id)))
        if not valid_oids:
            raise HTTPException(status_code=400, detail="No valid image IDs provided")
        image_query["_id"] = {"$in": valid_oids}
    else:
        image_query.update({
            "split": {"$ne": "train"},
            "$or": [
                {"annotation_status": {"$exists": False}},
                {"annotation_status": "unannotated"},
            ],
        })

    artifact_key = _artifact_key_from_url(job.get("artifact_url"))
    model_bytes = storage_client.download_file(artifact_key)
    with tempfile.NamedTemporaryFile(suffix=".pt", delete=False) as model_file:
        model_file.write(model_bytes)
        model_path = model_file.name

    created_annotations = 0
    processed_images = 0
    skipped_images = 0
    failed_images = 0

    try:
        model = YOLO(model_path)
        names = getattr(model, "names", {}) or {}
        training_config = _coerce_training_config(job.get("training_config"))
        confidence = float(training_config.get("confidence_threshold", 0.25))

        class_docs = await db.class_labels.find({"project_id": project_id}).to_list(None)
        classes_by_name = {label["name"].strip().lower(): label for label in class_docs}

        cursor = db.images.find(image_query)

        async for image_doc in cursor:
            filename = image_doc.get("filename")
            if not filename:
                skipped_images += 1
                continue

            image_id = str(image_doc["_id"])
            if not replace_existing:
                existing_count = await db.annotations.count_documents({"image_id": image_id})
                if existing_count:
                    skipped_images += 1
                    continue

            try:
                image_bytes = storage_client.download_file(filename)
                image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
                results = model.predict(image, conf=confidence, verbose=False)
            except Exception:
                failed_images += 1
                continue

            if replace_existing:
                await db.annotations.delete_many({"image_id": image_id})

            image_annotation_count = 0
            now = datetime.utcnow()

            if project_type == "classification":
                result = results[0] if results else None
                probs = getattr(result, "probs", None) if result else None
                top1 = getattr(probs, "top1", None)
                top1conf = getattr(probs, "top1conf", None)
                if top1 is not None:
                    class_name = str(names.get(int(top1), top1))
                    class_doc = classes_by_name.get(class_name.strip().lower())
                    if class_doc:
                        confidence_value = float(top1conf.item() if hasattr(top1conf, "item") else top1conf or 0)
                        await db.annotations.insert_one({
                            "image_id": image_id,
                            "project_id": project_id,
                            "created_by_user_id": str(user.id),
                            "class_id": str(class_doc["_id"]),
                            "class_name": class_doc["name"],
                            "type": "classification",
                            "coordinates": {
                                "confidence": round(confidence_value, 6),
                                "source": "auto_classify",
                                "training_job_id": job_id,
                            },
                            "created_at": now,
                        })
                        image_annotation_count = 1
            else:
                for result in results:
                    boxes = getattr(result, "boxes", None)
                    if boxes is None:
                        continue

                    for box in boxes:
                        cls_idx = int(box.cls[0].item())
                        class_name = str(names.get(cls_idx, cls_idx))
                        class_doc = classes_by_name.get(class_name.strip().lower())
                        if not class_doc:
                            continue

                        xyxy = box.xyxy[0].tolist()
                        x = max(0.0, min(float(image.width), float(xyxy[0])))
                        y = max(0.0, min(float(image.height), float(xyxy[1])))
                        width = max(0.0, min(float(image.width) - x, float(xyxy[2] - xyxy[0])))
                        height = max(0.0, min(float(image.height) - y, float(xyxy[3] - xyxy[1])))

                        await db.annotations.insert_one({
                            "image_id": image_id,
                            "project_id": project_id,
                            "created_by_user_id": str(user.id),
                            "class_id": str(class_doc["_id"]),
                            "class_name": class_doc["name"],
                            "type": "bbox",
                            "coordinates": {
                                "x": round(x, 6),
                                "y": round(y, 6),
                                "width": round(width, 6),
                                "height": round(height, 6),
                                "confidence": round(float(box.conf[0].item()), 6),
                                "source": "auto_label",
                                "training_job_id": job_id,
                            },
                            "created_at": now,
                        })
                        image_annotation_count += 1

            processed_images += 1
            if image_annotation_count:
                created_annotations += image_annotation_count
                await db.images.update_one(
                    {"_id": image_doc["_id"]},
                    {"$set": {"status": "annotated", "annotation_status": "annotated", "split": "train"}},
                )

        actual_annotation_count = await db.annotations.count_documents({"project_id": project_id})
        await db.projects.update_one(
            {"_id": ObjectId(project_id)},
            {"$set": {"annotation_count": actual_annotation_count, "updated_at": datetime.utcnow()}},
        )

        await db.class_labels.update_many(
            {"project_id": project_id},
            {"$set": {"annotation_count": 0}},
        )
        class_counts = await db.annotations.aggregate([
            {"$match": {"project_id": project_id}},
            {"$group": {"_id": "$class_id", "count": {"$sum": 1}}},
        ]).to_list(None)
        for item in class_counts:
            if ObjectId.is_valid(str(item["_id"])):
                await db.class_labels.update_one(
                    {"_id": ObjectId(item["_id"]), "project_id": project_id},
                    {"$set": {"annotation_count": item["count"]}},
                )

        await redis.delete(f"training:project:{project_id}")

        return {
            "status": "done",
            "processed_images": processed_images,
            "skipped_images": skipped_images,
            "failed_images": failed_images,
            "created_annotations": created_annotations,
        }
    finally:
        try:
            os.unlink(model_path)
        except OSError:
            pass


@router.get("")
async def list_training_jobs(
    project_id: str = Query(...),
    user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
    redis=Depends(get_redis),
) -> List[TrainingJobResponse]:
    """Get all training jobs for a project."""
    # Get project
    try:
        project_oid = ObjectId(project_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid project ID")

    project = await db.projects.find_one({"_id": project_oid})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Check access
    await check_project_access(user, project, db, "reviewer")

    # Try cache
    cache_key = f"training:project:{project_id}"
    cached = await redis.get(cache_key)
    if cached:
        return [
            TrainingJobResponse(**j)
            for j in json.loads(cached)
        ]

    # Fetch from DB
    jobs = await db.training_jobs.find(
        {"project_id": project_id}
    ).sort("created_at", -1).to_list(None)

    responses = [_training_job_to_response(j) for j in jobs]

    # Cache
    from fastapi.encoders import jsonable_encoder
    await redis.setex(
        cache_key,
        30,
        json.dumps(jsonable_encoder(responses)),
    )

    return responses


@router.delete("/{job_id}")
async def delete_training_job(
    job_id: str,
    user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
    redis=Depends(get_redis),
) -> dict:
    """Delete a training job from the project execution history."""
    try:
        job_oid = ObjectId(job_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid job ID")

    job = await db.training_jobs.find_one({"_id": job_oid})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    project = await db.projects.find_one({"_id": ObjectId(job["project_id"])})
    await check_project_access(user, project, db, "admin")

    await db.training_jobs.delete_one({"_id": job_oid})
    # Local training queue cleanup is not needed
    await redis.delete(f"training:project:{job['project_id']}")

    return {"status": "deleted", "job_id": job_id}


@router.get("/{job_id}")
async def get_training_job(
    job_id: str,
    user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> TrainingJobResponse:
    """Get a specific training job."""
    try:
        job_oid = ObjectId(job_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid job ID")

    job = await db.training_jobs.find_one({"_id": job_oid})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Check access
    project = await db.projects.find_one({"_id": ObjectId(job["project_id"])})
    await check_project_access(user, project, db, "reviewer")

    return _training_job_to_response(job)


@router.get("/{job_id}/stream")
async def stream_training_job(
    job_id: str,
    user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
    redis=Depends(get_redis),
):
    """
    Server-Sent Events endpoint for real-time training updates.
    Streams status changes from Redis Pub/Sub.
    """
    try:
        job_oid = ObjectId(job_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid job ID")

    job = await db.training_jobs.find_one({"_id": job_oid})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Check access
    project = await db.projects.find_one({"_id": ObjectId(job["project_id"])})
    await check_project_access(user, project, db, "reviewer")

    # SSE response generator
    async def event_generator():
        pubsub = redis.pubsub()
        channel = f"job:{job_id}"

        try:
            await pubsub.subscribe(channel)

            # Send initial state
            current_job = await db.training_jobs.find_one({"_id": job_oid})
            yield f"data: {_training_job_to_response(current_job).model_dump_json()}\n\n"

            # Stream updates
            while True:
                message = await pubsub.get_message(
                    ignore_subscribe_messages=True, timeout=0.1
                )
                if message:
                    data = message["data"]
                    if isinstance(data, bytes):
                        data = data.decode()
                    yield f"data: {data}\n\n"

                    # Check if job is done
                    current_job = await db.training_jobs.find_one(
                        {"_id": job_oid}
                    )
                    if current_job["status"] in ["done", "failed"]:
                        break
                else:
                    await asyncio.sleep(0.1)
        finally:
            await pubsub.unsubscribe(channel)

    from fastapi.responses import StreamingResponse

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
    )


@router.get("/{job_id}/colab-link")
async def generate_colab_link(
    job_id: str,
    user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
    redis=Depends(get_redis),
):
    """Generate Colab notebook link for training job"""
    try:
        job_oid = ObjectId(job_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid job ID")

    job = await db.training_jobs.find_one({"_id": job_oid})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job.get("training_backend") != "colab":
        raise HTTPException(status_code=400, detail="This job is not configured for Colab")

    # Check access
    project = await db.projects.find_one({"_id": ObjectId(job["project_id"])})
    await check_project_access(user, project, db, "reviewer")
    training_config = _coerce_training_config(job.get("training_config"))

    # Generate Colab link
    github_user = os.environ.get("GITHUB_USER", "")
    github_repo = os.environ.get("GITHUB_REPO", "")
    github_branch = os.environ.get("GITHUB_BRANCH", "main")
    backend_url = get_active_backend_url()

    project_type = project.get("type", "object-detection")
    if project_type == "classification":
        github_user = os.environ.get("GITHUB_CLASSIFICATION_USER", "DragonZux")
        github_repo = os.environ.get("GITHUB_CLASSIFICATION_REPO", "Train-Colab-Classification")
        github_branch = os.environ.get("GITHUB_CLASSIFICATION_BRANCH", "main")
        notebook_filename = os.environ.get("GITHUB_CLASSIFICATION_NOTEBOOK", "train_classification_notebook.ipynb")
    else:
        github_user = os.environ.get("GITHUB_USER", github_user)
        github_repo = os.environ.get("GITHUB_REPO", github_repo)
        github_branch = os.environ.get("GITHUB_BRANCH", github_branch)
        notebook_filename = os.environ.get("GITHUB_NOTEBOOK", "train_notebook.ipynb")

    if not github_user or not github_repo:
        raise HTTPException(
            status_code=500,
            detail="GitHub configuration not set (GITHUB_USER, GITHUB_REPO)"
        )

    backend_url = backend_url.rstrip("/")

    # Get dataset download URL and callback URL using actual API routes.
    dataset_url = f"{backend_url}/api/versions/{job['dataset_version_id']}/download"
    callback_url = f"{backend_url}/api/training/{job_id}/colab-callback"

    # Generate Colab URL with parameters for the notebook to consume.
    params = {
        "JOB_ID": job_id,
        "DATASET_URL": dataset_url,
        "CALLBACK_URL": callback_url,
        "ARCHITECTURE": training_config["architecture"],
        "EPOCHS": str(training_config["epochs"]),
        "IMAGE_SIZE": str(training_config["image_size"]),
        "BATCH_SIZE": str(training_config["batch_size"]),
        "LEARNING_RATE": str(training_config["learning_rate"]),
        "PATIENCE": str(training_config["patience"]),
        "CONFIDENCE_THRESHOLD": str(training_config["confidence_threshold"]),
    }

    colab_param_pairs = "&".join(
        f"{key}:'{quote(str(value), safe='')}'" for key, value in params.items()
    )
    colab_url = (
        f"https://colab.research.google.com/github/"
        f"{github_user}/{github_repo}/blob/{github_branch}/{notebook_filename}"
        f"?params={colab_param_pairs}"
    )

    await db.training_jobs.update_one(
        {"_id": job_oid},
        {
            "$set": {
                "status": "awaiting_colab",
                "started_at": job.get("started_at") or datetime.utcnow(),
                "training_config": training_config,
            }
        },
    )
    await redis.delete(f"training:project:{job['project_id']}")

    logger.info(f"Generated Colab link for job {job_id}")

    return {
        "colab_url": colab_url,
        "parameters": params,
        "job_id": job_id,
        "status": "ready"
    }


@router.post("/{job_id}/presign-upload")
async def presign_upload(
    job_id: str,
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """Return a presigned PUT URL and artifact key for uploading model artifacts from Colab."""
    try:
        job_oid = ObjectId(job_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid job ID")

    job = await db.training_jobs.find_one({"_id": job_oid})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Only allow presign for colab or kaggle configured jobs (safety)
    if job.get("training_backend") not in ("colab", "kaggle"):
        raise HTTPException(status_code=400, detail="Presign upload only allowed for Colab/Kaggle jobs")

    project_id = job["project_id"]
    project = await db.projects.find_one({"_id": ObjectId(project_id)})
    workspace_id = project.get("workspace_id", "default_workspace") if project else "default_workspace"
    artifact_key = f"workspaces/{workspace_id}/projects/{project_id}/model-artifacts/{job_id}/best.pt"
    upload_url = storage_client.generate_presigned_put_url(artifact_key, expires=3600)

    return {"upload_url": upload_url, "artifact_key": artifact_key, "expires": 3600}


@router.post("/{job_id}/upload-artifact")
async def upload_artifact(
    job_id: str,
    file: UploadFile = File(...),
    db: AsyncIOMotorDatabase = Depends(get_database),
    redis=Depends(get_redis),
):
    """Accept multipart upload from Colab and store the artifact in MinIO."""
    try:
        job_oid = ObjectId(job_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid job ID")

    job = await db.training_jobs.find_one({"_id": job_oid})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job.get("training_backend") not in ("colab", "kaggle"):
        raise HTTPException(status_code=400, detail="Upload only allowed for Colab/Kaggle jobs")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded artifact is empty")

    project_id = job["project_id"]
    project = await db.projects.find_one({"_id": ObjectId(project_id)})
    workspace_id = project.get("workspace_id", "default_workspace") if project else "default_workspace"
    artifact_key = f"workspaces/{workspace_id}/projects/{project_id}/model-artifacts/{job_id}/best.pt"
    storage_client.upload_file(
        file_bytes=content,
        filename=artifact_key,
        content_type=(file.content_type or "application/octet-stream"),
    )
    model_url = f"minio://{artifact_key}"
    await db.training_jobs.update_one(
        {"_id": job_oid},
        {"$set": {"artifact_url": model_url}},
    )
    await redis.delete(f"training:project:{job['project_id']}")

    return {"model_url": model_url, "artifact_key": artifact_key}


@router.post("/{job_id}/colab-callback")
async def colab_callback(
    job_id: str,
    data: dict,
    db: AsyncIOMotorDatabase = Depends(get_database),
    redis=Depends(get_redis)
):
    """Callback endpoint for Colab to send training results"""
    try:
        logger.info(f"Received Colab callback for job {job_id}")

        job_oid = ObjectId(job_id)
        status = data.get("status", "unknown")
        job = await db.training_jobs.find_one({"_id": job_oid})
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")

        if status == "done":
            # Training succeeded
            metrics = data.get("metrics", {})
            model_url = data.get("model_url")

            if not _minio_artifact_exists(model_url):
                error_msg = (
                    "Colab finished training, but the model artifact was not uploaded to storage. "
                    "Reopen the Colab notebook generated by Label Forge and run all cells again."
                )
                logger.error("Job %s callback rejected: %s", job_id, error_msg)
                await db.training_jobs.update_one(
                    {"_id": job_oid},
                    {
                        "$set": {
                            "status": "failed",
                            "error_message": error_msg,
                            "finished_at": datetime.utcnow(),
                            "artifact_url": None,
                        }
                    },
                )
                raise HTTPException(status_code=400, detail=error_msg)

            try:
                completed_epochs = int(metrics.get("epochs", data.get("epochs", 0)) or 0)
            except Exception:
                completed_epochs = 0
            completed_epochs = completed_epochs or int(data.get("total_epochs", 0) or 0)
            total_epochs = completed_epochs or int(job.get("total_epochs", 50))

            logger.info(f"Job {job_id} completed successfully")

            await db.training_jobs.update_one(
                {"_id": job_oid},
                {
                    "$set": {
                        "status": "done",
                        "map_score": metrics.get("map_score", 0),
                        "precision": metrics.get("precision", 0),
                        "recall": metrics.get("recall", 0),
                        "epochs_completed": completed_epochs,
                        "total_epochs": total_epochs,
                        "sample_predictions": data.get("sample_predictions", []),
                        "finished_at": datetime.utcnow(),
                        "artifact_url": model_url,
                    },
                    "$push": {
                        "metrics_history": {
                            "epoch": completed_epochs,
                            "map": metrics.get("map_score", 0),
                            "precision": metrics.get("precision", 0),
                            "recall": metrics.get("recall", 0)
                        }
                    }
                }
            )
        else:
            # Training failed
            error_msg = data.get("error", "Unknown error from Colab")

            logger.error(f"Job {job_id} failed: {error_msg}")

            await db.training_jobs.update_one(
                {"_id": job_oid},
                {
                    "$set": {
                        "status": "failed",
                        "error_message": error_msg,
                        "finished_at": datetime.utcnow()
                    }
                }
            )

        # Notify frontend
        await redis.delete(f"training:project:{job['project_id']}")

        await redis.publish(
            f"job:{job_id}",
            json.dumps({
                "status": status,
                "metrics": data.get("metrics", {}),
                "error": data.get("error")
            })
        )

        logger.info(f"Job {job_id} callback processed successfully")
        return {"status": "received", "job_id": job_id}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Callback error for job {job_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
