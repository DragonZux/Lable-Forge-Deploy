"""
Training worker service.
Pulls jobs from Redis queue, trains YOLO models, and updates job status via Pub/Sub.
"""

import asyncio
from concurrent.futures import BrokenExecutor, ProcessPoolExecutor
import io
import json
import logging
import os
import shutil
import tempfile
import zipfile
from datetime import datetime

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from ..core.storage import storage_client

logger = logging.getLogger(__name__)

_training_executor: ProcessPoolExecutor | None = None

CPU_MODEL_LIMITS = {
    "yolov8n": {"batch": 16, "image_size": 640},
    "yolov8s": {"batch": 8, "image_size": 640},
    "yolov8m": {"batch": 2, "image_size": 640},
    "yolov8l": {"batch": 1, "image_size": 512},
    "yolov8x": {"batch": 1, "image_size": 512},
}


def get_training_executor() -> ProcessPoolExecutor:
    global _training_executor
    if _training_executor is None:
        _training_executor = ProcessPoolExecutor(max_workers=1)
    return _training_executor


def shutdown_training_executor() -> None:
    global _training_executor
    if _training_executor is not None:
        _training_executor.shutdown(wait=False, cancel_futures=True)
        _training_executor = None


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


async def start_training_worker(db: AsyncIOMotorDatabase, redis):
    """
    Start background training worker.
    Polls Redis queue every 5 seconds and trains queued local jobs.
    """
    logger.info("Training worker started")
    await mark_interrupted_jobs_failed(db)

    while True:
        try:
            job_id = await redis.lpop("training_queue")

            if job_id:
                job_id_str = job_id.decode() if isinstance(job_id, bytes) else job_id
                logger.info("Processing job: %s", job_id_str)

                try:
                    await process_training_job(job_id_str, db, redis)
                except Exception as e:
                    logger.error("Job %s failed: %s", job_id_str, str(e))
            else:
                await asyncio.sleep(5)

        except Exception as e:
            logger.error("Training worker error: %s", str(e))
            await asyncio.sleep(5)


async def mark_interrupted_jobs_failed(db: AsyncIOMotorDatabase):
    """Fail local jobs that were mid-flight when the API process restarted."""
    result = await db.training_jobs.update_many(
        {
            "training_backend": {"$ne": "colab"},
            "status": {"$in": ["preparing", "training", "evaluating"]},
            "finished_at": None,
        },
        {
            "$set": {
                "status": "failed",
                "error_message": "Training was interrupted by a server restart. Start a new training job to retry.",
                "finished_at": datetime.utcnow(),
            }
        },
    )
    if result.modified_count:
        logger.warning("Marked %s interrupted training job(s) as failed", result.modified_count)


async def process_training_job(job_id: str, db: AsyncIOMotorDatabase, redis):
    """
    Process a single training job through all stages.
    Updates job status via Redis Pub/Sub.
    """
    try:
        job_oid = ObjectId(job_id)
    except Exception:
        logger.error("Invalid job ID: %s", job_id)
        return

    job = await db.training_jobs.find_one({"_id": job_oid})
    if not job:
        logger.error("Job not found: %s", job_id)
        return

    job_channel = f"job:{job_id}"

    try:
        dataset_version = await db.dataset_versions.find_one(
            {"_id": ObjectId(job["dataset_version_id"])}
        )
        if not dataset_version:
            raise RuntimeError("Dataset version not found")
        if dataset_version.get("status") != "ready":
            raise RuntimeError("Dataset version is not ready yet")

        await update_job_status(job_oid, "preparing", db, redis, job_channel)

        training_config = job.get("training_config", {})
        total_epochs = max(
            1,
            int(job.get("total_epochs", training_config.get("epochs", 50))),
        )

        await update_job_status(job_oid, "training", db, redis, job_channel)
        loop = asyncio.get_running_loop()
        try:
            result = await loop.run_in_executor(
                get_training_executor(),
                _train_yolo_model,
                job_id,
                dataset_version,
                training_config,
                total_epochs,
            )
        except BrokenExecutor as exc:
            shutdown_training_executor()
            raise RuntimeError(
                "Training process ran out of memory or was killed by the OS. "
                "Try a smaller preset/model, lower image size, or lower batch size."
            ) from exc

        await db.training_jobs.update_one(
            {"_id": job_oid},
            {
                "$set": {
                    "epochs_completed": total_epochs,
                    "metrics_history": result["metrics_history"],
                }
            },
        )
        job = await db.training_jobs.find_one({"_id": job_oid})
        await redis.publish(job_channel, _serialize_job_for_pub_sub(job))

        await update_job_status(job_oid, "evaluating", db, redis, job_channel)

        await db.training_jobs.update_one(
            {"_id": job_oid},
            {
                "$set": {
                    "status": "done",
                    "map_score": result["map_score"],
                    "precision": result["precision"],
                    "recall": result["recall"],
                    "artifact_url": result["artifact_url"],
                    "metrics_history": result["metrics_history"],
                    "confusion_matrix": result.get("confusion_matrix"),
                    "sample_predictions": result["sample_predictions"],
                    "finished_at": datetime.utcnow(),
                }
            },
        )

        job = await db.training_jobs.find_one({"_id": job_oid})
        await redis.publish(job_channel, _serialize_job_for_pub_sub(job))

        logger.info("Job %s completed successfully", job_id)

    except Exception as e:
        logger.error("Error processing job %s: %s", job_id, str(e))

        await db.training_jobs.update_one(
            {"_id": job_oid},
            {
                "$set": {
                    "status": "failed",
                    "error_message": str(e),
                    "finished_at": datetime.utcnow(),
                }
            },
        )

        job = await db.training_jobs.find_one({"_id": job_oid})
        if job:
            await redis.publish(job_channel, _serialize_job_for_pub_sub(job))


def _metric_value(metrics: dict, candidates: list[str]) -> float:
    for key in candidates:
        value = metrics.get(key)
        if value is not None:
            try:
                return float(value)
            except (TypeError, ValueError):
                pass
    return 0.0


def _train_yolo_model(
    job_id: str,
    dataset_version: dict,
    training_config: dict,
    total_epochs: int,
) -> dict:
    """Run YOLO training in a worker process and upload best.pt to MinIO."""
    os.environ.setdefault("OMP_NUM_THREADS", "2")
    os.environ.setdefault("MKL_NUM_THREADS", "2")

    import torch
    from ultralytics import YOLO

    torch.set_num_threads(min(2, os.cpu_count() or 1))

    version_id = str(dataset_version["_id"])
    zip_filename = f"version_{version_id}.zip"
    work_dir = tempfile.mkdtemp(prefix=f"labelforge_train_{job_id}_")
    dataset_dir = os.path.join(work_dir, "dataset")
    runs_dir = os.path.join(work_dir, "runs")

    try:
        zip_bytes = storage_client.download_file(zip_filename)
        os.makedirs(dataset_dir, exist_ok=True)
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zip_ref:
            zip_ref.extractall(dataset_dir)

        data_yaml = os.path.join(dataset_dir, "data.yaml")
        if not os.path.exists(data_yaml):
            raise RuntimeError("Dataset ZIP does not contain data.yaml")

        architecture = training_config.get("architecture", "yolov8s")
        if architecture not in {"yolov8n", "yolov8s", "yolov8m", "yolov8l", "yolov8x"}:
            architecture = "yolov8s"

        device = training_config.get("device", "cpu")
        image_size = int(training_config.get("image_size", 640))
        batch_size = int(training_config.get("batch_size", 16))
        if device == "cpu":
            limits = CPU_MODEL_LIMITS[architecture]
            image_size = min(image_size, limits["image_size"])
            batch_size = min(batch_size, limits["batch"])

        confidence = float(training_config.get("confidence_threshold", 0.25))

        model = YOLO(f"{architecture}.pt")
        train_results = model.train(
            data=data_yaml,
            epochs=total_epochs,
            imgsz=image_size,
            batch=batch_size,
            lr0=float(training_config.get("learning_rate", 0.006)),
            patience=int(training_config.get("patience", 12)),
            project=runs_dir,
            name="train",
            exist_ok=True,
            device=device,
            workers=0,
            plots=False,
            verbose=False,
        )

        save_dir = getattr(train_results, "save_dir", None) or os.path.join(runs_dir, "train")
        best_model_path = os.path.join(str(save_dir), "weights", "best.pt")
        if not os.path.exists(best_model_path):
            raise RuntimeError("Training completed but best.pt was not created")

        trained_model = YOLO(best_model_path)
        validation = trained_model.val(data=data_yaml, imgsz=image_size, verbose=False)
        metrics = getattr(validation, "results_dict", {}) or {}
        map_score = _metric_value(metrics, ["metrics/mAP50-95(B)", "metrics/mAP50-95"])
        precision = _metric_value(metrics, ["metrics/precision(B)", "metrics/precision"])
        recall = _metric_value(metrics, ["metrics/recall(B)", "metrics/recall"])

        artifact_key = f"model-artifacts/{job_id}/best.pt"
        with open(best_model_path, "rb") as model_file:
            storage_client.upload_file(
                file_bytes=model_file.read(),
                filename=artifact_key,
                content_type="application/octet-stream",
            )

        return {
            "map_score": map_score,
            "precision": precision,
            "recall": recall,
            "artifact_url": f"minio://{artifact_key}",
            "metrics_history": [
                {
                    "epoch": total_epochs,
                    "map": map_score,
                    "precision": precision,
                    "recall": recall,
                }
            ],
            "confusion_matrix": None,
            "sample_predictions": _sample_predictions(trained_model, dataset_dir, confidence),
        }
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


def _sample_predictions(model, dataset_dir: str, confidence: float) -> list[dict]:
    valid_images_dir = os.path.join(dataset_dir, "valid", "images")
    if not os.path.isdir(valid_images_dir):
        return []

    image_paths = []
    for filename in os.listdir(valid_images_dir):
        if filename.lower().endswith((".jpg", ".jpeg", ".png", ".bmp", ".webp")):
            image_paths.append(os.path.join(valid_images_dir, filename))
        if len(image_paths) >= 6:
            break

    if not image_paths:
        return []

    predictions = []
    names = getattr(model, "names", {}) or {}
    results = model.predict(image_paths, conf=confidence, verbose=False)
    for result in results:
        image_name = os.path.basename(getattr(result, "path", "sample.jpg"))
        boxes = getattr(result, "boxes", None)
        if boxes is None:
            continue
        for box in boxes[:1]:
            cls_idx = int(box.cls[0].item())
            xywhn = box.xywhn[0].tolist()
            predictions.append(
                {
                    "image_name": image_name,
                    "class_name": names.get(cls_idx, str(cls_idx)),
                    "confidence": round(float(box.conf[0].item()), 4),
                    "bbox": {
                        "x": round(float(xywhn[0] - xywhn[2] / 2), 4),
                        "y": round(float(xywhn[1] - xywhn[3] / 2), 4),
                        "width": round(float(xywhn[2]), 4),
                        "height": round(float(xywhn[3]), 4),
                    },
                }
            )
    return predictions[:6]


async def update_job_status(
    job_oid: ObjectId,
    status: str,
    db: AsyncIOMotorDatabase,
    redis,
    channel: str,
):
    """Update job status and publish update via Pub/Sub."""
    update_data = {"status": status}

    if status == "preparing":
        update_data["started_at"] = datetime.utcnow()

    await db.training_jobs.update_one(
        {"_id": job_oid},
        {"$set": update_data},
    )

    job = await db.training_jobs.find_one({"_id": job_oid})
    await redis.publish(channel, _serialize_job_for_pub_sub(job))

    logger.info("Job %s status: %s", job_oid, status)
