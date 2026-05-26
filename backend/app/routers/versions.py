"""
Dataset Versions router - Create, retrieve, and export dataset versions.
Protected endpoints: all require authentication.
"""

import random
import json
from datetime import datetime
from typing import List
import io
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from fastapi.responses import StreamingResponse
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from ..models.dataset_version import DatasetVersionCreate, DatasetVersionResponse
from ..models.user import UserInDB
from ..models.image import ImageSplit
from ..utils.auth import get_current_user
from ..core.database import get_database
from ..core.redis import get_redis
from ..routers.projects import check_project_access
from ..services.dataset_service import DatasetService

router = APIRouter(prefix="/versions", tags=["Versions"])


def _version_to_response(version: dict) -> DatasetVersionResponse:
    """Convert MongoDB version document to DatasetVersionResponse."""
    return DatasetVersionResponse(
        id=str(version["_id"]),
        project_id=version["project_id"],
        version_number=version["version_number"],
        preprocessing=version["preprocessing"],
        augmentation=version["augmentation"],
        train_count=version.get("train_count", 0),
        valid_count=version.get("valid_count", 0),
        test_count=version.get("test_count", 0),
        status=version.get("status", "ready"),
        processing_progress=version.get("processing_progress", 0),
        zip_url=version.get("zip_url"),
        created_at=version.get("created_at"),
    )


@router.post("", status_code=201)
async def create_version(
    background_tasks: BackgroundTasks,
    project_id: str = Query(...),
    payload: DatasetVersionCreate = None,
    user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
    redis=Depends(get_redis),
) -> DatasetVersionResponse:
    """
    Create a new dataset version.
    Validates split percentages sum to 100.
    Auto-assigns unassigned images to splits.
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
    await check_project_access(user, project, db, "annotator")

    # Validate split percentages
    total = payload.train_percent + payload.valid_percent + payload.test_percent
    if total != 100:
        raise HTTPException(
            status_code=400,
            detail=f"Split percentages must sum to 100 (got {total})",
        )

    # Get all unassigned images
    unassigned = await db.images.find(
        {"project_id": project_id, "split": "unassigned"}
    ).to_list(None)

    # Shuffle and assign
    random.shuffle(unassigned)
    train_count = int(len(unassigned) * payload.train_percent / 100)
    valid_count = int(len(unassigned) * payload.valid_percent / 100)

    # Update images with split
    train_ids = [img["_id"] for img in unassigned[:train_count]]
    valid_ids = [
        img["_id"]
        for img in unassigned[train_count : train_count + valid_count]
    ]
    test_ids = [img["_id"] for img in unassigned[train_count + valid_count :]]

    if train_ids:
        await db.images.update_many(
            {"_id": {"$in": train_ids}},
            {"$set": {"split": "train"}},
        )
    if valid_ids:
        await db.images.update_many(
            {"_id": {"$in": valid_ids}},
            {"$set": {"split": "valid"}},
        )
    if test_ids:
        await db.images.update_many(
            {"_id": {"$in": test_ids}},
            {"$set": {"split": "test"}},
        )

    # Count existing splits
    existing_train = await db.images.count_documents(
        {"project_id": project_id, "split": "train"}
    )
    existing_valid = await db.images.count_documents(
        {"project_id": project_id, "split": "valid"}
    )
    existing_test = await db.images.count_documents(
        {"project_id": project_id, "split": "test"}
    )

    # Get next version number
    last_version = await db.dataset_versions.find_one(
        {"project_id": project_id},
        sort=[("version_number", -1)],
    )
    next_version_number = (last_version["version_number"] if last_version else 0) + 1

    # Create version document
    now = datetime.utcnow()
    version_doc = {
        "project_id": project_id,
        "version_number": next_version_number,
        "preprocessing": payload.preprocessing.model_dump(),
        "augmentation": payload.augmentation.model_dump(),
        "train_count": existing_train,
        "valid_count": existing_valid,
        "test_count": existing_test,
        "status": "processing",
        "processing_progress": 0,
        "created_at": now,
    }

    result = await db.dataset_versions.insert_one(version_doc)
    version_id = str(result.inserted_id)
    version_doc["_id"] = result.inserted_id

    # Start background processing
    background_tasks.add_task(DatasetService.process_dataset_version, db, version_id)

    # Invalidate cache
    cache_key = f"versions:project:{project_id}"
    await redis.delete(cache_key)

    return _version_to_response(version_doc)


@router.get("")
async def list_versions(
    project_id: str = Query(...),
    user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
    redis=Depends(get_redis),
) -> List[DatasetVersionResponse]:
    """
    Get all dataset versions for a project.
    Results cached for 60 seconds.
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
    await check_project_access(user, project, db, "viewer")

    # Try cache
    cache_key = f"versions:project:{project_id}"
    cached = await redis.get(cache_key)
    if cached:
        return [
            DatasetVersionResponse(**v)
            for v in json.loads(cached)
        ]

    # Fetch from DB
    versions = await db.dataset_versions.find(
        {"project_id": project_id}
    ).sort("version_number", -1).to_list(None)

    responses = [_version_to_response(v) for v in versions]

    # Cache
    from fastapi.encoders import jsonable_encoder
    await redis.setex(
        cache_key,
        60,
        json.dumps(jsonable_encoder(responses)),
    )

    return responses


@router.get("/{version_id}")
async def get_version(
    version_id: str,
    user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> DatasetVersionResponse:
    """Get a specific dataset version."""
    try:
        version_oid = ObjectId(version_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid version ID")

    version = await db.dataset_versions.find_one({"_id": version_oid})
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")

    # Check access
    project = await db.projects.find_one({"_id": ObjectId(version["project_id"])})
    await check_project_access(user, project, db, "viewer")

    return _version_to_response(version)


@router.get("/{version_id}/export")
async def export_version(
    version_id: str,
    format: str = Query("yolov8", pattern="^(yolov8|coco|pascal_voc|csv)$"),
    user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    """
    Export dataset in specified format.
    Returns manifest JSON describing dataset structure and URLs.
    Formats: yolov8, coco, pascal_voc, csv
    """
    try:
        version_oid = ObjectId(version_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid version ID")

    version = await db.dataset_versions.find_one({"_id": version_oid})
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")

    # Check access
    project = await db.projects.find_one({"_id": ObjectId(version["project_id"])})
    await check_project_access(user, project, db, "reviewer")

    # Get images by split
    splits = {}
    for split in ["train", "valid", "test"]:
        images = await db.images.find(
            {"project_id": version["project_id"], "split": split}
        ).to_list(None)

        image_items = []
        for img in images:
            # Get annotations for this image
            annotations = await db.annotations.find(
                {"image_id": str(img["_id"])}
            ).to_list(None)

            ann_list = [
                {
                    "class_id": ann["class_id"],
                    "class_name": ann["class_name"],
                    "type": ann["type"],
                    "coordinates": ann["coordinates"],
                }
                for ann in annotations
            ]

            image_items.append(
                {
                    "id": str(img["_id"]),
                    "filename": img["filename"],
                    "url": img.get("url") or img.get("filename"),
                    "width": img["width"],
                    "height": img["height"],
                    "annotations": ann_list,
                }
            )

        splits[split] = image_items

    # Build manifest based on format
    manifest = {
        "version_id": str(version["_id"]),
        "version_number": version["version_number"],
        "project_id": version["project_id"],
        "format": format,
        "created_at": version["created_at"].isoformat(),
        "preprocessing": version["preprocessing"],
        "augmentation": version["augmentation"],
        "splits": splits,
        "stats": {
            "train_count": version.get("train_count", 0),
            "valid_count": version.get("valid_count", 0),
            "test_count": version.get("test_count", 0),
            "total": (
                version.get("train_count", 0)
                + version.get("valid_count", 0)
                + version.get("test_count", 0)
            ),
        },
    }

    return manifest


@router.get("/{version_id}/download")
async def download_version(
    version_id: str,
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """
    Download the zipped dataset version.
    Acts as a proxy gateway so Google Colab can download the dataset
    even if the internal storage provider (MinIO) is on a private network.
    """
    try:
        version_oid = ObjectId(version_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid version ID")

    version = await db.dataset_versions.find_one({"_id": version_oid})
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")

    if version.get("status") != "ready":
        raise HTTPException(status_code=400, detail="Dataset version is not ready yet")

    # Import storage client to download and stream
    from ..core.storage import storage_client
    zip_filename = f"version_{version_id}.zip"

    try:
        file_bytes = storage_client.download_file(zip_filename)
        return StreamingResponse(
            io.BytesIO(file_bytes),
            media_type="application/zip",
            headers={"Content-Disposition": f"attachment; filename={zip_filename}"}
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve dataset ZIP: {str(e)}"
        )
