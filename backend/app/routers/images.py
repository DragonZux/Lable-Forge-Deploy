"""
Images router — Upload, retrieve, and manage project images.
Protected endpoints: all require authentication.
"""

from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, BackgroundTasks
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase
from PIL import Image as PILImage
import io
import uuid

from ..models.image import ImageResponse
from ..models.user import UserInDB
from ..utils.auth import get_current_user
from ..core.database import get_database
from ..core.storage import storage_client
from ..routers.projects import check_project_access

router = APIRouter(prefix="/images", tags=["Images"])

ALLOWED_IMAGE_TYPES = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/bmp": "bmp",
    "image/webp": "webp",
}


def _get_annotation_status(image: dict) -> str:
    if image.get("annotation_status") in {"annotated", "unannotated"}:
        return image["annotation_status"]
    return "annotated" if image.get("status") in {"annotated", "needs_review", "approved", "rejected"} else "unannotated"


def _get_review_status(image: dict) -> str:
    if image.get("review_status") in {"none", "needs_review", "approved", "rejected"}:
        return image["review_status"]
    legacy_status = image.get("status")
    if legacy_status in {"needs_review", "approved", "rejected"}:
        return legacy_status
    return "none"


def _get_legacy_image_status(image: dict) -> str:
    review_status = _get_review_status(image)
    if review_status != "none":
        return review_status
    return _get_annotation_status(image)


def _image_to_response(image: dict) -> ImageResponse:
    """Convert MongoDB image document to ImageResponse."""
    image_filename = image.get("filename")
    image_url = (
        storage_client.generate_presigned_url(image_filename)
        if image_filename
        else image.get("url", "")
    )

    return ImageResponse(
        id=str(image["_id"]),
        project_id=image["project_id"],
        filename=image_filename,
        original_filename=image["original_filename"],
        url=image_url,
        width=image["width"],
        height=image["height"],
        split=image.get("split", "unassigned"),
        status=_get_legacy_image_status(image),
        annotation_status=_get_annotation_status(image),
        review_status=_get_review_status(image),
        assigned_to_user_id=image.get("assigned_to_user_id"),
        assigned_by_user_id=image.get("assigned_by_user_id"),
        assigned_at=image.get("assigned_at"),
        due_at=image.get("due_at"),
        completed_at=image.get("completed_at"),
        assignment_status=image.get("assignment_status", "unassigned"),
        reviewer_id=image.get("reviewer_id"),
        reviewer_comment=image.get("reviewer_comment"),
        reviewed_at=image.get("reviewed_at"),
        created_at=image.get("created_at"),
    )


def _detect_image_content_type(file_bytes: bytes) -> Optional[str]:
    """
    Detect allowed image types from magic bytes instead of trusting upload headers.
    """
    if file_bytes.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if file_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if file_bytes.startswith(b"BM"):
        return "image/bmp"
    if (
        len(file_bytes) >= 12
        and file_bytes.startswith(b"RIFF")
        and file_bytes[8:12] == b"WEBP"
    ):
        return "image/webp"
    return None


def _project_effective_role(user: UserInDB, project: dict, workspace: dict) -> str:
    user_id = str(user.id)
    workspace_member = next(
        (m for m in workspace.get("members", []) if m["user_id"] == user_id),
        None,
    )
    project_member = next(
        (m for m in project.get("members", []) if m["user_id"] == user_id),
        None,
    )
    if workspace_member and workspace_member.get("role") in ["owner", "admin"]:
        return "admin"
    if project_member:
        return project_member.get("role", "viewer")
    if workspace_member:
        return "viewer"
    return "viewer"


@router.post("/upload", status_code=201)
async def upload_images(
    project_id: str = Query(...),
    files: List[UploadFile] = File(...),
    user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> List[ImageResponse]:
    """
    Upload multiple images to a project.
    
    Validates:
    - Only jpeg, png, bmp, webp allowed
    - Max 20MB per file
    - User has access to project workspace
    
    Returns list of ImageResponse, partial success on errors.
    """
    # Get project
    try:
        project_oid = ObjectId(project_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid project ID")

    project = await db.projects.find_one({"_id": project_oid})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Check project access
    await check_project_access(user, project, db, "annotator")

    if len(files) > 100:
        raise HTTPException(status_code=400, detail="Maximum 100 files per upload")

    max_file_size = 20 * 1024 * 1024  # 20MB

    uploaded_images = []
    errors = []

    for file in files:
        try:
            # Read file bytes
            file_bytes = await file.read()

            # Validate file size
            if len(file_bytes) > max_file_size:
                errors.append(f"{file.filename}: File too large (max 20MB)")
                continue

            detected_content_type = _detect_image_content_type(file_bytes)
            if detected_content_type not in ALLOWED_IMAGE_TYPES:
                errors.append(f"{file.filename}: Unsupported or invalid image type")
                continue

            # Get image dimensions
            try:
                img = PILImage.open(io.BytesIO(file_bytes))
                img.verify()
                img = PILImage.open(io.BytesIO(file_bytes))
                width, height = img.size
            except Exception:
                errors.append(f"{file.filename}: Invalid image file")
                continue

            # Generate unique filename
            file_ext = ALLOWED_IMAGE_TYPES[detected_content_type]
            unique_filename = f"{uuid.uuid4()}.{file_ext}"

            # Upload to MinIO
            file_url = storage_client.upload_file(
                file_bytes=file_bytes,
                filename=unique_filename,
                content_type=detected_content_type,
            )

            # Save to MongoDB
            now = datetime.utcnow()
            image_doc = {
                "project_id": project_id,
                "filename": unique_filename,
                "original_filename": file.filename,
                "url": file_url,
                "width": width,
                "height": height,
                "split": "unassigned",
                "status": "unannotated",
                "annotation_status": "unannotated",
                "review_status": "none",
                "assigned_to_user_id": None,
                "assigned_by_user_id": None,
                "assigned_at": None,
                "due_at": None,
                "completed_at": None,
                "assignment_status": "unassigned",
                "reviewer_id": None,
                "reviewer_comment": None,
                "reviewed_at": None,
                "created_at": now,
            }

            result = await db.images.insert_one(image_doc)
            image_doc["_id"] = result.inserted_id

            # Increment project image count
            await db.projects.update_one(
                {"_id": project_oid},
                {"$inc": {"image_count": 1}, "$set": {"updated_at": now}},
            )

            uploaded_images.append(_image_to_response(image_doc))

        except Exception as e:
            errors.append(f"{file.filename}: {str(e)}")
            continue

    if not uploaded_images and errors:
        raise HTTPException(
            status_code=400,
            detail=f"Upload failed: {'; '.join(errors)}",
        )

    return uploaded_images


@router.get("")
async def list_images(
    project_id: str = Query(...),
    split: str = Query(None),
    status: str = Query(None),
    assigned_to_user_id: str = Query(None),
    assignment_status: str = Query(None),
    class_id: Optional[str] = Query(None),
    created_from: Optional[datetime] = Query(None),
    created_to: Optional[datetime] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=500),
    search: Optional[str] = Query(None),
    user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    """
    List images in a project with pagination and filtering.
    
    Query parameters:
    - split: "train", "valid", "test", "unassigned" (optional)
    - status: "annotated", "unannotated" (optional)
    - page: 1-indexed page number
    - limit: items per page (default 50, max 500)
    
    Returns: { images, total, page, pages }
    """
    # Get project
    project = await db.projects.find_one({"_id": ObjectId(project_id)})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Check project access
    workspace = await check_project_access(user, project, db, "viewer")
    effective_role = _project_effective_role(user, project, workspace)

    # Build filter
    filter_doc = {"project_id": project_id}
    if split:
        filter_doc["split"] = split
    if status:
        if status in {"annotated", "unannotated"}:
            legacy_statuses = [status]
            if status == "annotated":
                legacy_statuses = ["annotated", "needs_review", "approved", "rejected"]
            filter_doc["$or"] = [
                {"annotation_status": status},
                {"annotation_status": {"$exists": False}, "status": {"$in": legacy_statuses}},
            ]
        elif status in {"needs_review", "approved", "rejected"}:
            filter_doc["$or"] = [
                {"review_status": status},
                {"review_status": {"$exists": False}, "status": status},
            ]
        else:
            filter_doc["status"] = status
    if assigned_to_user_id:
        filter_doc["assigned_to_user_id"] = assigned_to_user_id
    if assignment_status:
        filter_doc["assignment_status"] = assignment_status
    if created_from or created_to:
        filter_doc["created_at"] = {}
        if created_from:
            filter_doc["created_at"]["$gte"] = created_from
        if created_to:
            filter_doc["created_at"]["$lte"] = created_to
    if search:
        filter_doc["original_filename"] = {"$regex": search, "$options": "i"}
    if effective_role == "annotator":
        filter_doc["assigned_to_user_id"] = str(user.id)
    if class_id:
        image_ids = await db.annotations.distinct(
            "image_id",
            {"project_id": project_id, "class_id": class_id},
        )
        filter_doc["_id"] = {"$in": [ObjectId(image_id) for image_id in image_ids if ObjectId.is_valid(image_id)]}

    # Count total
    total = await db.images.count_documents(filter_doc)

    # Calculate pagination
    skip = (page - 1) * limit
    pages = (total + limit - 1) // limit

    # Fetch images with stable ordering so paged clients do not receive duplicates
    # when they request multiple pages in sequence.
    images = (
        await db.images.find(filter_doc)
        .sort([("created_at", -1), ("_id", -1)])
        .skip(skip)
        .limit(limit)
        .to_list(None)
    )

    return {
        "images": [_image_to_response(img) for img in images],
        "total": total,
        "page": page,
        "pages": pages,
    }


@router.get("/{image_id}")
async def get_image(
    image_id: str,
    user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    """
    Get detailed image info with all annotations.
    """
    try:
        image_oid = ObjectId(image_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid image ID")

    image = await db.images.find_one({"_id": image_oid})
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    # Check project access
    project = await db.projects.find_one({"_id": ObjectId(image["project_id"])})
    workspace = await check_project_access(user, project, db, "viewer")
    effective_role = _project_effective_role(user, project, workspace)
    if (
        effective_role == "annotator"
        and image.get("assigned_to_user_id") != str(user.id)
    ):
        raise HTTPException(status_code=403, detail="Access denied to image")

    # Get annotations
    annotations = await db.annotations.find(
        {"image_id": image_id}
    ).to_list(None)

    return {
        **_image_to_response(image).model_dump(),
        "annotations": [
            {
                "id": str(ann["_id"]),
                "image_id": ann["image_id"],
                "project_id": ann["project_id"],
                "created_by_user_id": ann.get("created_by_user_id"),
                "class_id": ann["class_id"],
                "class_name": ann["class_name"],
                "type": ann["type"],
                "coordinates": ann["coordinates"],
                "created_at": ann.get("created_at"),
            }
            for ann in annotations
        ],
    }


@router.patch("/{image_id}/review", status_code=200)
async def review_image(
    image_id: str,
    payload: dict,
    user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> ImageResponse:
    """
    Set review status for an image.
    Body: {"status": "needs_review" | "approved" | "rejected", "comment"?: str}
    """
    try:
        image_oid = ObjectId(image_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid image ID")

    image = await db.images.find_one({"_id": image_oid})
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    project = await db.projects.find_one({"_id": ObjectId(image["project_id"])})
    await check_project_access(user, project, db, "reviewer")

    review_status = payload.get("status")
    valid_statuses = {"needs_review", "approved", "rejected"}
    if review_status not in valid_statuses:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid review status. Must be one of: {', '.join(valid_statuses)}",
        )

    comment = payload.get("comment")
    now = datetime.utcnow()
    update_data = {
        "status": review_status,
        "review_status": review_status,
        "reviewer_id": str(user.id),
        "reviewer_comment": comment,
        "reviewed_at": now,
    }
    if review_status == "rejected":
        update_data["assignment_status"] = "in_progress"

    await db.images.update_one({"_id": image_oid}, {"$set": update_data})
    await db.annotation_audit_logs.insert_one({
        "project_id": image["project_id"],
        "image_id": image_id,
        "annotation_id": None,
        "action": f"image_{review_status}",
        "actor_user_id": str(user.id),
        "before": {
            "status": image.get("status"),
            "review_status": _get_review_status(image),
            "reviewer_comment": image.get("reviewer_comment"),
        },
        "after": {
            "status": review_status,
            "review_status": review_status,
            "reviewer_comment": comment,
        },
        "created_at": now,
    })

    updated = await db.images.find_one({"_id": image_oid})
    return _image_to_response(updated)


@router.patch("/{image_id}/split", status_code=200)
async def update_image_split(
    image_id: str,
    payload: dict,
    user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> ImageResponse:
    """
    Update the split (train/valid/test/unassigned) of an image.
    Body: {"split": "train" | "valid" | "test" | "unassigned"}
    """
    try:
        image_oid = ObjectId(image_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid image ID")

    image = await db.images.find_one({"_id": image_oid})
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    # Check project access
    project = await db.projects.find_one({"_id": ObjectId(image["project_id"])})
    await check_project_access(user, project, db, "annotator")

    # Validate split value
    valid_splits = {"train", "valid", "test", "unassigned"}
    new_split = payload.get("split")
    if new_split not in valid_splits:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid split. Must be one of: {', '.join(valid_splits)}",
        )

    # Update
    await db.images.update_one(
        {"_id": image_oid},
        {"$set": {"split": new_split}},
    )

    # Fetch updated
    updated = await db.images.find_one({"_id": image_oid})
    return _image_to_response(updated)


@router.patch("/batch-split", status_code=200)
async def batch_update_split(
    payload: dict,
    user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    """
    Batch update image splits.
    Body: {"image_ids": ["id1", "id2", ...], "split": "train" | "valid" | "test" | "unassigned"}
    """
    image_ids = payload.get("image_ids", [])
    new_split = payload.get("split")

    if not image_ids:
        raise HTTPException(status_code=400, detail="image_ids required")

    # Validate split value
    valid_splits = {"train", "valid", "test", "unassigned"}
    if new_split not in valid_splits:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid split. Must be one of: {', '.join(valid_splits)}",
        )

    # Convert to ObjectIds
    try:
        image_oids = [ObjectId(img_id) for img_id in image_ids]
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid image ID format")

    images = await db.images.find({"_id": {"$in": image_oids}}).to_list(None)
    if len(images) != len(image_oids):
        raise HTTPException(status_code=404, detail="One or more images not found")

    project_ids = set(img["project_id"] for img in images)
    for project_id in project_ids:
        project = await db.projects.find_one({"_id": ObjectId(project_id)})
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        await check_project_access(user, project, db, "annotator")

    # Batch update
    result = await db.images.update_many(
        {"_id": {"$in": image_oids}},
        {"$set": {"split": new_split}},
    )

    return {
        "modified_count": result.modified_count,
        "matched_count": result.matched_count,
    }


@router.delete("/{image_id}", status_code=204)
async def delete_image(
    image_id: str,
    background_tasks: BackgroundTasks,
    user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """
    Delete an image and its annotations.
    File deletion from MinIO is async.
    """
    try:
        image_oid = ObjectId(image_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid image ID")

    image = await db.images.find_one({"_id": image_oid})
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    # Check project access
    project = await db.projects.find_one({"_id": ObjectId(image["project_id"])})
    await check_project_access(user, project, db, "admin")

    filename = image.get("filename")
    if filename:
        background_tasks.add_task(storage_client.delete_file, filename)

    # Delete from MongoDB
    await db.images.delete_one({"_id": image_oid})
    await db.annotations.delete_many({"image_id": image_id})

    # Decrement project image count
    await db.projects.update_one(
        {"_id": ObjectId(image["project_id"])},
        {"$inc": {"image_count": -1}},
    )

    return None


@router.post("/batch-delete", status_code=204)
async def batch_delete_images(
    payload: dict,
    background_tasks: BackgroundTasks,
    user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """
    Batch delete multiple images and their annotations.
    Body: {"image_ids": ["id1", "id2", ...]}
    """
    image_ids = payload.get("image_ids", [])

    if not image_ids:
        raise HTTPException(status_code=400, detail="image_ids required")

    # Convert to ObjectIds
    try:
        image_oids = [ObjectId(img_id) for img_id in image_ids]
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid image ID format")

    images = await db.images.find({"_id": {"$in": image_oids}}).to_list(None)
    if len(images) != len(image_oids):
        raise HTTPException(status_code=404, detail="One or more images not found")

    filenames = [img["filename"] for img in images]
    project_ids = list(set(img["project_id"] for img in images))

    for project_id in project_ids:
        project = await db.projects.find_one({"_id": ObjectId(project_id)})
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        await check_project_access(user, project, db, "admin")

    # Delete files from MinIO (background tasks)
    for filename in filenames:
        background_tasks.add_task(storage_client.delete_file, filename)

    # Delete from MongoDB
    await db.images.delete_many({"_id": {"$in": image_oids}})
    await db.annotations.delete_many({"image_id": {"$in": image_ids}})

    # Decrement project image counts
    for project_id in project_ids:
        count = len([img for img in images if img["project_id"] == project_id])
        await db.projects.update_one(
            {"_id": ObjectId(project_id)},
            {"$inc": {"image_count": -count}},
        )

    return None
