"""
Annotations router — Create, retrieve, and manage image annotations.
Protected endpoints: all require authentication.
"""

from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase
import csv
import io
import json

from ..models.annotation import AnnotationCreate, AnnotationResponse
from ..models.user import UserInDB
from ..utils.auth import get_current_user
from ..core.database import get_database
from ..routers.projects import check_project_access

router = APIRouter(prefix="/annotations", tags=["Annotations"])

CLASS_COLORS = [
    "#2563eb",
    "#16a34a",
    "#dc2626",
    "#9333ea",
    "#ea580c",
    "#0891b2",
    "#ca8a04",
    "#be185d",
]


async def _write_audit_log(
    db: AsyncIOMotorDatabase,
    *,
    project_id: str,
    image_id: str,
    annotation_id: Optional[str],
    action: str,
    actor_user_id: str,
    before: Optional[dict] = None,
    after: Optional[dict] = None,
) -> None:
    await db.annotation_audit_logs.insert_one({
        "project_id": project_id,
        "image_id": image_id,
        "annotation_id": annotation_id,
        "action": action,
        "actor_user_id": actor_user_id,
        "before": before,
        "after": after,
        "created_at": datetime.utcnow(),
    })


async def _get_project_class_label(
    db: AsyncIOMotorDatabase,
    project_id: str,
    class_id: str,
) -> dict:
    try:
        class_oid = ObjectId(class_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid class ID")

    class_label = await db.class_labels.find_one({
        "_id": class_oid,
        "project_id": project_id,
    })
    if not class_label:
        raise HTTPException(status_code=400, detail="Class label not found in project")
    return class_label


def _annotation_to_response(annotation: dict) -> AnnotationResponse:
    """Convert MongoDB annotation document to AnnotationResponse."""
    return AnnotationResponse(
        id=str(annotation["_id"]),
        image_id=annotation["image_id"],
        project_id=annotation["project_id"],
        created_by_user_id=annotation.get("created_by_user_id"),
        class_id=annotation["class_id"],
        class_name=annotation["class_name"],
        type=annotation["type"],
        coordinates=annotation["coordinates"],
        created_at=annotation.get("created_at"),
    )


def _normalise_filename(value: str) -> str:
    return (value or "").replace("\\", "/").split("/")[-1].strip().lower()


def _pick(row: dict, *names: str) -> Optional[str]:
    for name in names:
        value = row.get(name)
        if value not in (None, ""):
            return value
    return None


def _to_float(value: object, field_name: str) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail=f"Invalid numeric value for {field_name}")


def _coco_annotations(payload: dict) -> list[dict]:
    images_by_coco_id = {
        image.get("id"): image
        for image in payload.get("images", [])
        if image.get("id") is not None
    }
    categories_by_id = {
        category.get("id"): category.get("name", str(category.get("id")))
        for category in payload.get("categories", [])
        if category.get("id") is not None
    }

    rows = []
    for annotation in payload.get("annotations", []):
        image = images_by_coco_id.get(annotation.get("image_id"))
        if not image:
            continue
        bbox = annotation.get("bbox")
        segmentation = annotation.get("segmentation")
        class_name = categories_by_id.get(annotation.get("category_id"), str(annotation.get("category_id", "Object")))
        if isinstance(segmentation, list) and segmentation and isinstance(segmentation[0], list) and len(segmentation[0]) >= 6:
            points = segmentation[0]
            rows.append({
                "filename": image.get("file_name"),
                "class_name": class_name,
                "type": "polygon",
                "coordinates": {
                    "points": [[float(points[index]), float(points[index + 1])] for index in range(0, len(points) - 1, 2)]
                },
            })
        elif bbox and len(bbox) >= 4:
            rows.append({
                "filename": image.get("file_name"),
                "class_name": class_name,
                "type": "bbox",
                "coordinates": {
                    "x": float(bbox[0]),
                    "y": float(bbox[1]),
                    "width": float(bbox[2]),
                    "height": float(bbox[3]),
                },
            })
    return rows


def _csv_annotations(file_bytes: bytes) -> list[dict]:
    text = file_bytes.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail="CSV file has no header row")

    normalised_rows = []
    for raw_row in reader:
        row = {key.strip().lower(): value for key, value in raw_row.items() if key}
        filename = _pick(row, "filename", "file_name", "image", "image_name", "path")
        class_name = _pick(row, "class", "class_name", "label", "category", "category_name")
        if not filename or not class_name:
            continue

        x = _pick(row, "x", "left")
        y = _pick(row, "y", "top")
        width = _pick(row, "width", "w")
        height = _pick(row, "height", "h")
        if x is not None and y is not None and width is not None and height is not None:
            coordinates = {
                "x": _to_float(x, "x"),
                "y": _to_float(y, "y"),
                "width": _to_float(width, "width"),
                "height": _to_float(height, "height"),
            }
        else:
            xmin = _pick(row, "xmin", "x_min")
            ymin = _pick(row, "ymin", "y_min")
            xmax = _pick(row, "xmax", "x_max")
            ymax = _pick(row, "ymax", "y_max")
            if xmin is None or ymin is None or xmax is None or ymax is None:
                continue
            x_min = _to_float(xmin, "xmin")
            y_min = _to_float(ymin, "ymin")
            coordinates = {
                "x": x_min,
                "y": y_min,
                "width": max(0, _to_float(xmax, "xmax") - x_min),
                "height": max(0, _to_float(ymax, "ymax") - y_min),
            }

        normalised_rows.append({
            "filename": filename,
            "class_name": class_name,
            "type": "bbox",
            "coordinates": coordinates,
        })
    return normalised_rows


async def _ensure_can_edit_image_annotations(
    user: UserInDB,
    image: dict,
    project: dict,
    db: AsyncIOMotorDatabase,
) -> None:
    workspace = await check_project_access(user, project, db, "annotator")
    user_id = str(user.id)
    workspace_member = next(
        (m for m in workspace.get("members", []) if m["user_id"] == user_id),
        None,
    )
    project_member = next(
        (m for m in project.get("members", []) if m["user_id"] == user_id),
        None,
    )
    is_admin = bool(
        workspace_member and workspace_member.get("role") in ["owner", "admin"]
    ) or bool(project_member and project_member.get("role") == "admin")
    assigned_to = image.get("assigned_to_user_id")
    if assigned_to and assigned_to != user_id and not is_admin:
        raise HTTPException(
            status_code=403,
            detail="Only the assigned user or an admin can edit this image",
        )


async def _ensure_can_view_image_annotations(
    user: UserInDB,
    image: dict,
    project: dict,
    db: AsyncIOMotorDatabase,
) -> None:
    workspace = await check_project_access(user, project, db, "viewer")
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
        return
    if project_member and project_member.get("role") in ["admin", "reviewer"]:
        return
    if project_member and project_member.get("role") == "annotator":
        if image.get("assigned_to_user_id") == user_id:
            return
        raise HTTPException(status_code=403, detail="Access denied to image")


@router.get("")
async def list_annotations(
    image_id: str = Query(...),
    user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> List[AnnotationResponse]:
    """
    Get all annotations for an image.
    """
    # Get image
    image = await db.images.find_one({"_id": ObjectId(image_id)})
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    # Check project access
    project = await db.projects.find_one({"_id": ObjectId(image["project_id"])})
    await _ensure_can_view_image_annotations(user, image, project, db)

    # Get annotations
    annotations = await db.annotations.find(
        {"image_id": image_id}
    ).to_list(None)

    return [_annotation_to_response(ann) for ann in annotations]


@router.get("/history")
async def list_annotation_history(
    image_id: str = Query(...),
    user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> List[dict]:
    """
    Get annotation and review audit history for an image.
    """
    try:
        image_oid = ObjectId(image_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid image ID")

    image = await db.images.find_one({"_id": image_oid})
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    project = await db.projects.find_one({"_id": ObjectId(image["project_id"])})
    await _ensure_can_view_image_annotations(user, image, project, db)

    rows = await db.annotation_audit_logs.find(
        {"image_id": image_id}
    ).sort("created_at", -1).limit(100).to_list(None)

    user_ids = sorted({
        row.get("actor_user_id")
        for row in rows
        if row.get("actor_user_id") and ObjectId.is_valid(row.get("actor_user_id"))
    })
    users = {
        str(doc["_id"]): doc
        for doc in await db.users.find({"_id": {"$in": [ObjectId(uid) for uid in user_ids]}}).to_list(None)
    }

    return [
        {
            "id": str(row["_id"]),
            "project_id": row["project_id"],
            "image_id": row["image_id"],
            "annotation_id": row.get("annotation_id"),
            "action": row["action"],
            "actor_user_id": row.get("actor_user_id"),
            "actor_name": users.get(row.get("actor_user_id"), {}).get("full_name"),
            "before": row.get("before"),
            "after": row.get("after"),
            "created_at": row.get("created_at"),
        }
        for row in rows
    ]


@router.post("", status_code=201)
async def create_annotation(
    payload: AnnotationCreate,
    user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> AnnotationResponse:
    """
    Create a new annotation for an image.
    Also updates image status to 'annotated' and increments annotation count.
    """
    # Get image
    try:
        image_oid = ObjectId(payload.image_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid image ID")

    image = await db.images.find_one({"_id": image_oid})
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    # Check project access
    project = await db.projects.find_one({"_id": ObjectId(image["project_id"])})
    await _ensure_can_edit_image_annotations(user, image, project, db)
    class_label = await _get_project_class_label(db, image["project_id"], payload.class_id)

    # Create annotation
    now = datetime.utcnow()
    annotation_doc = {
        "image_id": payload.image_id,
        "project_id": image["project_id"],
        "created_by_user_id": str(user.id),
        "class_id": payload.class_id,
        "class_name": class_label["name"],
        "type": payload.type,
        "coordinates": payload.coordinates,
        "created_at": now,
    }

    result = await db.annotations.insert_one(annotation_doc)
    annotation_doc["_id"] = result.inserted_id
    await _write_audit_log(
        db,
        project_id=image["project_id"],
        image_id=payload.image_id,
        annotation_id=str(result.inserted_id),
        action="annotation_created",
        actor_user_id=str(user.id),
        after={
            "class_id": payload.class_id,
            "class_name": class_label["name"],
            "type": payload.type,
            "coordinates": payload.coordinates,
        },
    )

    await db.images.update_one(
        {"_id": image_oid},
        {"$set": {"status": "annotated", "annotation_status": "annotated"}},
    )

    if image.get("assignment_status") == "assigned":
        await db.images.update_one(
            {"_id": image_oid},
            {"$set": {"assignment_status": "in_progress"}},
        )

    # Increment annotation count in project
    await db.projects.update_one(
        {"_id": ObjectId(image["project_id"])},
        {"$inc": {"annotation_count": 1}},
    )

    # Increment annotation count in class label
    await db.class_labels.update_one(
        {"_id": class_label["_id"]},
        {"$inc": {"annotation_count": 1}},
    )

    return _annotation_to_response(annotation_doc)


@router.post("/import", status_code=201)
async def import_annotations(
    project_id: str = Query(...),
    format: str = Query("coco", pattern="^(coco|csv)$"),
    replace_existing: bool = Query(False),
    file: UploadFile = File(...),
    user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    """
    Import annotations from COCO JSON or a bounding-box CSV.

    CSV columns supported:
    - filename/file_name/image/path
    - class/class_name/label/category
    - x,y,width,height or xmin,ymin,xmax,ymax
    """
    try:
        project_oid = ObjectId(project_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid project ID")

    project = await db.projects.find_one({"_id": project_oid})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    await check_project_access(user, project, db, "annotator")

    file_bytes = await file.read()
    if len(file_bytes) > 25 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Annotation file is too large (max 25MB)")

    try:
        parsed_rows = _coco_annotations(json.loads(file_bytes.decode("utf-8-sig"))) if format == "coco" else _csv_annotations(file_bytes)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid COCO JSON file")

    if not parsed_rows:
        raise HTTPException(status_code=400, detail="No supported annotations found in file")

    images = await db.images.find({"project_id": project_id}).to_list(None)
    images_by_name = {}
    for image in images:
        for name in [image.get("original_filename"), image.get("filename")]:
            normalised = _normalise_filename(name)
            if normalised:
                images_by_name[normalised] = image

    class_docs = await db.class_labels.find({"project_id": project_id}).to_list(None)
    classes_by_name = {label["name"].strip().lower(): label for label in class_docs}

    new_class_docs = []
    class_order = len(class_docs)
    for row in parsed_rows:
        class_key = str(row["class_name"]).strip().lower()
        if not class_key or class_key in classes_by_name:
            continue
        class_doc = {
            "project_id": project_id,
            "name": str(row["class_name"]).strip(),
            "color": CLASS_COLORS[class_order % len(CLASS_COLORS)],
            "annotation_count": 0,
            "created_at": datetime.utcnow(),
        }
        result = await db.class_labels.insert_one(class_doc)
        class_doc["_id"] = result.inserted_id
        classes_by_name[class_key] = class_doc
        new_class_docs.append(class_doc)
        class_order += 1

    now = datetime.utcnow()
    new_docs = []
    matched_image_ids = set()
    missing_filenames = set()
    class_increments = {}
    for row in parsed_rows:
        image = images_by_name.get(_normalise_filename(row["filename"]))
        if not image:
            missing_filenames.add(str(row["filename"]))
            continue

        class_label = classes_by_name.get(str(row["class_name"]).strip().lower())
        if not class_label:
            continue
        image_id = str(image["_id"])
        class_id = str(class_label["_id"])
        matched_image_ids.add(image_id)
        class_increments[class_id] = class_increments.get(class_id, 0) + 1
        new_docs.append({
            "image_id": image_id,
            "project_id": project_id,
            "created_by_user_id": str(user.id),
            "class_id": class_id,
            "class_name": class_label["name"],
            "type": row["type"],
            "coordinates": row["coordinates"],
            "created_at": now,
        })

    if not new_docs:
        raise HTTPException(
            status_code=400,
            detail="No annotations matched existing image filenames",
        )

    old_annotations = []
    if replace_existing and matched_image_ids:
        old_annotations = await db.annotations.find({
            "project_id": project_id,
            "image_id": {"$in": list(matched_image_ids)},
        }).to_list(None)
        await db.annotations.delete_many({
            "project_id": project_id,
            "image_id": {"$in": list(matched_image_ids)},
        })

    await db.annotations.insert_many(new_docs)

    await db.images.update_many(
        {"_id": {"$in": [ObjectId(image_id) for image_id in matched_image_ids]}},
        {"$set": {"status": "annotated", "annotation_status": "annotated"}},
    )

    old_class_decrements = {}
    for annotation in old_annotations:
        old_class_id = annotation["class_id"]
        old_class_decrements[old_class_id] = old_class_decrements.get(old_class_id, 0) + 1

    count_diff = len(new_docs) - len(old_annotations)
    if count_diff:
        await db.projects.update_one({"_id": project_oid}, {"$inc": {"annotation_count": count_diff}})

    for class_id, decrement_count in old_class_decrements.items():
        if ObjectId.is_valid(class_id):
            await db.class_labels.update_one(
                {"_id": ObjectId(class_id)},
                {"$inc": {"annotation_count": -decrement_count}},
            )

    for class_id, increment_count in class_increments.items():
        await db.class_labels.update_one(
            {"_id": ObjectId(class_id)},
            {"$inc": {"annotation_count": increment_count}},
        )

    await db.annotation_audit_logs.insert_one({
        "project_id": project_id,
        "image_id": None,
        "annotation_id": None,
        "action": "annotations_imported",
        "actor_user_id": str(user.id),
        "before": {"deleted": len(old_annotations)},
        "after": {
            "format": format,
            "created": len(new_docs),
            "matched_images": len(matched_image_ids),
            "created_classes": len(new_class_docs),
            "missing_filenames": sorted(missing_filenames)[:25],
        },
        "created_at": now,
    })

    return {
        "created": len(new_docs),
        "deleted": len(old_annotations),
        "matched_images": len(matched_image_ids),
        "created_classes": len(new_class_docs),
        "missing_images": len(missing_filenames),
        "missing_filenames": sorted(missing_filenames)[:25],
    }


@router.put("/{annotation_id}", status_code=200)
async def update_annotation(
    annotation_id: str,
    payload: dict,
    user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> AnnotationResponse:
    """
    Update annotation coordinates or class.
    Body: {"coordinates"?: dict, "class_id"?: str, "class_name"?: str}
    """
    try:
        annotation_oid = ObjectId(annotation_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid annotation ID")

    annotation = await db.annotations.find_one({"_id": annotation_oid})
    if not annotation:
        raise HTTPException(status_code=404, detail="Annotation not found")

    # Check project access
    project = await db.projects.find_one({"_id": ObjectId(annotation["project_id"])})
    image = await db.images.find_one({"_id": ObjectId(annotation["image_id"])})
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    await _ensure_can_edit_image_annotations(user, image, project, db)

    # Build update
    update_data = {}
    if "coordinates" in payload:
        update_data["coordinates"] = payload["coordinates"]
    new_class_label = None
    if "class_id" in payload:
        new_class_label = await _get_project_class_label(
            db,
            annotation["project_id"],
            payload["class_id"],
        )
        update_data["class_id"] = payload["class_id"]
        update_data["class_name"] = new_class_label["name"]
    elif "class_name" in payload:
        raise HTTPException(status_code=400, detail="class_name cannot be updated directly")

    if update_data:
        await db.annotations.update_one(
            {"_id": annotation_oid},
            {"$set": update_data},
        )
        await _write_audit_log(
            db,
            project_id=annotation["project_id"],
            image_id=annotation["image_id"],
            annotation_id=annotation_id,
            action="annotation_updated",
            actor_user_id=str(user.id),
            before={
                "class_id": annotation.get("class_id"),
                "class_name": annotation.get("class_name"),
                "type": annotation.get("type"),
                "coordinates": annotation.get("coordinates"),
            },
            after=update_data,
        )
        if new_class_label and payload["class_id"] != annotation["class_id"]:
            await db.class_labels.update_one(
                {"_id": ObjectId(annotation["class_id"])},
                {"$inc": {"annotation_count": -1}},
            )
            await db.class_labels.update_one(
                {"_id": new_class_label["_id"]},
                {"$inc": {"annotation_count": 1}},
            )

    # Fetch updated
    updated = await db.annotations.find_one({"_id": annotation_oid})
    return _annotation_to_response(updated)


@router.delete("/{annotation_id}", status_code=204)
async def delete_annotation(
    annotation_id: str,
    user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """
    Delete an annotation.
    If image has no more annotations, mark as 'unannotated'.
    """
    try:
        annotation_oid = ObjectId(annotation_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid annotation ID")

    annotation = await db.annotations.find_one({"_id": annotation_oid})
    if not annotation:
        raise HTTPException(status_code=404, detail="Annotation not found")

    # Check project access
    project = await db.projects.find_one({"_id": ObjectId(annotation["project_id"])})
    image = await db.images.find_one({"_id": ObjectId(annotation["image_id"])})
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    await _ensure_can_edit_image_annotations(user, image, project, db)

    # Delete annotation
    await db.annotations.delete_one({"_id": annotation_oid})
    await _write_audit_log(
        db,
        project_id=annotation["project_id"],
        image_id=annotation["image_id"],
        annotation_id=annotation_id,
        action="annotation_deleted",
        actor_user_id=str(user.id),
        before={
            "class_id": annotation.get("class_id"),
            "class_name": annotation.get("class_name"),
            "type": annotation.get("type"),
            "coordinates": annotation.get("coordinates"),
        },
    )

    # Check if image has more annotations
    remaining = await db.annotations.count_documents(
        {"image_id": annotation["image_id"]}
    )
    if remaining == 0:
        await db.images.update_one(
            {"_id": ObjectId(annotation["image_id"])},
            {"$set": {"status": "unannotated", "annotation_status": "unannotated"}},
        )

    # Decrement annotation count in project
    await db.projects.update_one(
        {"_id": ObjectId(annotation["project_id"])},
        {"$inc": {"annotation_count": -1}},
    )

    # Decrement annotation count in class label
    await db.class_labels.update_one(
        {"_id": ObjectId(annotation["class_id"])},
        {"$inc": {"annotation_count": -1}},
    )

    return None


@router.post("/batch", status_code=201)
async def batch_create_annotations(
    payload: dict,
    user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    """
    Batch create annotations for an image.
    Deletes old annotations first, then inserts all new ones.
    
    Body: {
        "image_id": str,
        "annotations": [
            {
                "class_id": str,
                "class_name": str,
                "type": "bbox" | "polygon" | "classification",
                "coordinates": dict
            },
            ...
        ]
    }
    """
    image_id = payload.get("image_id")
    annotations_list = payload.get("annotations", [])

    if not image_id:
        raise HTTPException(status_code=400, detail="image_id required")

    # Get image
    try:
        image_oid = ObjectId(image_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid image ID")

    image = await db.images.find_one({"_id": image_oid})
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    # Check project access
    project = await db.projects.find_one({"_id": ObjectId(image["project_id"])})
    await _ensure_can_edit_image_annotations(user, image, project, db)

    # Validate and build new annotations before deleting old data.
    now = datetime.utcnow()
    new_docs = []
    class_increments = {}
    class_labels_by_id = {}

    for ann_data in annotations_list:
        class_id = ann_data.get("class_id")
        if not class_id:
            raise HTTPException(status_code=400, detail="class_id required")
        annotation_type = ann_data.get("type")
        coordinates = ann_data.get("coordinates")
        if not annotation_type:
            raise HTTPException(status_code=400, detail="type required")
        if coordinates is None:
            raise HTTPException(status_code=400, detail="coordinates required")
        if class_id not in class_labels_by_id:
            class_labels_by_id[class_id] = await _get_project_class_label(
                db,
                image["project_id"],
                class_id,
            )
        class_label = class_labels_by_id[class_id]

        ann_doc = {
            "image_id": image_id,
            "project_id": image["project_id"],
            "created_by_user_id": str(user.id),
            "class_id": class_id,
            "class_name": class_label["name"],
            "type": annotation_type,
            "coordinates": coordinates,
            "created_at": now,
        }
        new_docs.append(ann_doc)
        class_increments[class_id] = class_increments.get(class_id, 0) + 1

    # Get old annotations count for decrementing after new payload is valid.
    old_annotations = await db.annotations.find(
        {"image_id": image_id}
    ).to_list(None)
    old_count = len(old_annotations)

    # Group old annotations by class for decrementing
    class_decrements = {}
    for ann in old_annotations:
        class_id = ann["class_id"]
        class_decrements[class_id] = class_decrements.get(class_id, 0) + 1

    # Delete old annotations
    await db.annotations.delete_many({"image_id": image_id})

    # Insert new annotations
    result = None
    if new_docs:
        result = await db.annotations.insert_many(new_docs)

    # Update image status
    new_status = "annotated" if len(annotations_list) > 0 else "unannotated"
    await db.images.update_one(
        {"_id": image_oid},
        {"$set": {"status": new_status, "annotation_status": new_status}},
    )
    if annotations_list and image.get("assignment_status") == "assigned":
        await db.images.update_one(
            {"_id": image_oid},
            {"$set": {"assignment_status": "in_progress"}},
        )
    await _write_audit_log(
        db,
        project_id=image["project_id"],
        image_id=image_id,
        annotation_id=None,
        action="annotations_saved",
        actor_user_id=str(user.id),
        before={"annotation_count": old_count},
        after={
            "annotation_count": len(annotations_list),
            "types": [ann.get("type") for ann in annotations_list],
        },
    )

    # Update project annotation count
    count_diff = len(annotations_list) - old_count
    if count_diff != 0:
        await db.projects.update_one(
            {"_id": ObjectId(image["project_id"])},
            {"$inc": {"annotation_count": count_diff}},
        )

    # Update class label counts
    for class_id, decrement_count in class_decrements.items():
        await db.class_labels.update_one(
            {"_id": ObjectId(class_id)},
            {"$inc": {"annotation_count": -decrement_count}},
        )

    for class_id, increment_count in class_increments.items():
        await db.class_labels.update_one(
            {"_id": ObjectId(class_id)},
            {"$inc": {"annotation_count": increment_count}},
        )

    return {
        "created": len(annotations_list),
        "deleted": old_count,
    }
