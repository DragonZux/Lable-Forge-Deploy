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
from ..core.redis import get_redis

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

            # Generate unique filename with project prefix structure
            file_ext = ALLOWED_IMAGE_TYPES[detected_content_type]
            workspace_id = project.get("workspace_id", "default_workspace")
            unique_filename = f"workspaces/{workspace_id}/projects/{project_id}/images/{uuid.uuid4()}.{file_ext}"

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


@router.post("/upload-zip", status_code=201)
async def upload_images_zip(
    project_id: str = Query(...),
    file: UploadFile = File(...),
    user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
    redis=Depends(get_redis),
):
    """
    Upload a ZIP dataset (YOLO format with data.yaml, COCO format JSON, or raw images)
    directly into the active project dataset, making them available for annotation.
    """
    import zipfile
    import json
    import yaml
    from PIL import Image as PILImage
    import os
    import uuid
    from datetime import datetime

    # 1. Get and validate project
    try:
        project_oid = ObjectId(project_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid project ID")

    project = await db.projects.find_one({"_id": project_oid})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Check project access
    await check_project_access(user, project, db, "annotator")

    # 2. Read and validate ZIP file size (max 500MB)
    file_bytes = await file.read()
    if len(file_bytes) > 500 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="ZIP file is too large (max 500MB)")

    try:
        src_zip = zipfile.ZipFile(io.BytesIO(file_bytes), "r")
        namelist = src_zip.namelist()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid or corrupted ZIP file: {str(e)}")

    # 3. Detect format (YOLO, COCO, or Raw images)
    yaml_path = None
    json_paths = []

    for name in namelist:
        if name.startswith("__MACOSX") or "__macosx" in name.lower():
            continue
        base_name = os.path.basename(name)
        if base_name == "data.yaml":
            yaml_path = name
        elif name.lower().endswith(".json"):
            json_paths.append(name)

    is_yolo = yaml_path is not None
    is_coco = not is_yolo and len(json_paths) > 0

    class_names = []
    coco_images_by_filename = {}
    coco_annotations_by_img_id = {}
    coco_categories = {}
    now = datetime.utcnow()

    # Define standard colors for automatically created class labels
    CLASS_COLORS = [
        "#2563eb", "#16a34a", "#dc2626", "#9333ea",
        "#ea580c", "#0891b2", "#ca8a04", "#be185d"
    ]

    # 4. Handle YOLO format data.yaml classes
    if is_yolo:
        try:
            yaml_content = src_zip.read(yaml_path).decode("utf-8", errors="ignore")
            data_yaml = yaml.safe_load(yaml_content)
            if isinstance(data_yaml, dict):
                names = data_yaml.get("names")
                if isinstance(names, dict):
                    class_names = [names[k] for k in sorted(names.keys())]
                elif isinstance(names, list):
                    class_names = names
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to parse data.yaml in YOLO ZIP: {str(e)}")

    # 5. Handle COCO format categories/annotations
    elif is_coco:
        for json_path in json_paths:
            try:
                coco_data = json.loads(src_zip.read(json_path).decode("utf-8", errors="ignore"))
                
                # Parse categories
                for cat in coco_data.get("categories", []):
                    cat_id = cat.get("id")
                    cat_name = cat.get("name")
                    if cat_id is not None and cat_name:
                        coco_categories[cat_id] = cat_name
                
                # Group annotations by image ID
                for ann in coco_data.get("annotations", []):
                    img_id = ann.get("image_id")
                    if img_id is not None:
                        if img_id not in coco_annotations_by_img_id:
                            coco_annotations_by_img_id[img_id] = []
                        coco_annotations_by_img_id[img_id].append(ann)
                        
                # Map images by filename/basename for easy lookup
                for coco_img in coco_data.get("images", []):
                    img_id = coco_img.get("id")
                    filename = coco_img.get("file_name")
                    if img_id is not None and filename:
                        coco_images_by_filename[filename.lower()] = (img_id, coco_img)
                        coco_images_by_filename[os.path.basename(filename).lower()] = (img_id, coco_img)
            except Exception as e:
                logger.warning(f"Failed to parse COCO JSON {json_path}: {e}")

    # Scan image paths first so we can parse classification folder-based classes if needed
    image_paths = []
    for name in namelist:
        if name.startswith("__MACOSX") or "__macosx" in name.lower():
            continue
        if name.lower().endswith((".jpg", ".jpeg", ".png", ".bmp", ".webp")):
            image_paths.append(name)

    if not image_paths:
        raise HTTPException(status_code=400, detail="No image files (.jpg, .png, etc.) found in ZIP archive.")

    # 6. Synchronize class labels in DB
    is_classification = project.get("type") == "classification"
    generic_names = {"train", "val", "test", "valid", "images", "labels", "dataset", "archive", "content", ""}
    
    if is_yolo:
        target_class_names = class_names
    elif is_coco:
        target_class_names = list(coco_categories.values())
    elif is_classification:
        classification_classes = set()
        for img_path in image_paths:
            parent = os.path.basename(os.path.dirname(img_path)).strip()
            if parent and parent.lower() not in generic_names:
                classification_classes.add(parent)
        target_class_names = list(classification_classes)
    else:
        target_class_names = []

    existing_classes = await db.class_labels.find({"project_id": project_id}).to_list(None)
    existing_names_lower = {c["name"].lower(): c for c in existing_classes}
    classes_by_name = {c["name"].lower(): c for c in existing_classes}
    
    new_class_docs = []
    class_order = len(existing_classes)
    for cname in target_class_names:
        cname_clean = cname.strip()
        if not cname_clean:
            continue
        if cname_clean.lower() not in existing_names_lower:
            color = CLASS_COLORS[class_order % len(CLASS_COLORS)]
            new_class_docs.append({
                "project_id": project_id,
                "name": cname_clean,
                "color": color,
                "annotation_count": 0,
                "created_at": now,
            })
            class_order += 1

    if new_class_docs:
        await db.class_labels.insert_many(new_class_docs)
        updated_classes = await db.class_labels.find({"project_id": project_id}).to_list(None)
        classes_by_name = {c["name"].lower(): c for c in updated_classes}

    def find_yolo_label_path(img_path: str) -> Optional[str]:
        base_name_no_ext = os.path.splitext(os.path.basename(img_path))[0]
        img_dir = os.path.dirname(img_path)
        
        # Parallel labels dir e.g. train/images/... -> train/labels/...
        if "images" in img_dir.lower():
            labels_dir = img_dir.replace("images", "labels").replace("Images", "Labels")
            possible_path = os.path.join(labels_dir, f"{base_name_no_ext}.txt").replace("\\", "/")
            if possible_path in namelist:
                return possible_path
                
        # Same dir e.g. train/...txt
        possible_path = os.path.join(img_dir, f"{base_name_no_ext}.txt").replace("\\", "/")
        if possible_path in namelist:
            return possible_path
            
        # Anywhere in zip
        for name in namelist:
            if name.endswith(f"/{base_name_no_ext}.txt") or name == f"{base_name_no_ext}.txt":
                return name
        return None

    imported_images_count = 0
    imported_annotations_count = 0
    project_image_inc = 0
    project_annotation_inc = 0
    class_annotation_increments = {}

    # 8. Loop and ingest images + annotations
    for img_path in image_paths:
        try:
            img_bytes = src_zip.read(img_path)
            
            # Load dimension
            try:
                img_pil = PILImage.open(io.BytesIO(img_bytes))
                width, height = img_pil.size
            except Exception:
                continue

            # Detect split from path
            split = "unassigned"
            path_parts = img_path.lower().split("/")
            for part in ["train", "valid", "test"]:
                if part in path_parts:
                    split = part
                    break

            # Upload image to MinIO with project prefix structure
            detected_content_type = _detect_image_content_type(img_bytes) or "image/jpeg"
            file_ext = ALLOWED_IMAGE_TYPES.get(detected_content_type, "jpg")
            workspace_id = project.get("workspace_id", "default_workspace")
            unique_filename = f"workspaces/{workspace_id}/projects/{project_id}/images/{uuid.uuid4()}.{file_ext}"
            
            file_url = storage_client.upload_file(
                file_bytes=img_bytes,
                filename=unique_filename,
                content_type=detected_content_type,
            )

            # Look for matching annotations
            has_labels = False
            img_annotations = []

            # A. Extract YOLO Labels
            if is_yolo and class_names:
                label_path = find_yolo_label_path(img_path)
                if label_path:
                    try:
                        txt_content = src_zip.read(label_path).decode("utf-8", errors="ignore")
                        for line in txt_content.strip().split("\n"):
                            parts = line.strip().split()
                            if len(parts) >= 5:
                                class_idx = int(parts[0])
                                x_center = float(parts[1])
                                y_center = float(parts[2])
                                w_norm = float(parts[3])
                                h_norm = float(parts[4])
                                
                                if 0 <= class_idx < len(class_names):
                                    cname = class_names[class_idx]
                                    class_doc = classes_by_name.get(cname.lower())
                                    if class_doc:
                                        # Denormalize YOLO normalized float coordinates back to pixel values
                                        w = w_norm * width
                                        h = h_norm * height
                                        x = (x_center - w_norm / 2) * width
                                        y = (y_center - h_norm / 2) * height
                                        
                                        img_annotations.append({
                                            "class_id": str(class_doc["_id"]),
                                            "class_name": class_doc["name"],
                                            "type": "bbox",
                                            "coordinates": {
                                                "x": round(max(0.0, x), 2),
                                                "y": round(max(0.0, y), 2),
                                                "width": round(min(float(width), w), 2),
                                                "height": round(min(float(height), h), 2),
                                            }
                                        })
                                        has_labels = True
                    except Exception as le:
                        logger.warning(f"Error parsing YOLO labels at {label_path}: {le}")

            # B. Extract COCO Labels
            elif is_coco:
                match_key = img_path.lower()
                coco_match = coco_images_by_filename.get(match_key)
                if not coco_match:
                    match_key = os.path.basename(img_path).lower()
                    coco_match = coco_images_by_filename.get(match_key)

                if coco_match:
                    coco_id, coco_img_doc = coco_match
                    anns = coco_annotations_by_img_id.get(coco_id, [])
                    for ann in anns:
                        cat_id = ann.get("category_id")
                        bbox = ann.get("bbox")
                        cname = coco_categories.get(cat_id)
                        if cname and bbox and len(bbox) >= 4:
                            class_doc = classes_by_name.get(cname.lower())
                            if class_doc:
                                img_annotations.append({
                                    "class_id": str(class_doc["_id"]),
                                    "class_name": class_doc["name"],
                                    "type": "bbox",
                                    "coordinates": {
                                        "x": float(bbox[0]),
                                        "y": float(bbox[1]),
                                        "width": float(bbox[2]),
                                        "height": float(bbox[3]),
                                    }
                                })
                                has_labels = True

            # C. Extract Classification label from folder
            elif is_classification:
                parent = os.path.basename(os.path.dirname(img_path)).strip()
                if parent and parent.lower() not in generic_names:
                    class_doc = classes_by_name.get(parent.lower())
                    if class_doc:
                        img_annotations.append({
                            "class_id": str(class_doc["_id"]),
                            "class_name": class_doc["name"],
                            "type": "classification",
                            "coordinates": {}
                        })
                        has_labels = True

            # Insert Image into MongoDB
            image_doc = {
                "project_id": project_id,
                "filename": unique_filename,
                "original_filename": os.path.basename(img_path),
                "url": file_url,
                "width": width,
                "height": height,
                "split": split,
                "status": "annotated" if has_labels else "unannotated",
                "annotation_status": "annotated" if has_labels else "unannotated",
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

            img_result = await db.images.insert_one(image_doc)
            new_image_id = str(img_result.inserted_id)
            imported_images_count += 1
            project_image_inc += 1

            # Insert Annotations into MongoDB
            if img_annotations:
                for ann in img_annotations:
                    ann_doc = {
                        "image_id": new_image_id,
                        "project_id": project_id,
                        "created_by_user_id": str(user.id),
                        "class_id": ann["class_id"],
                        "class_name": ann["class_name"],
                        "type": ann["type"],
                        "coordinates": ann["coordinates"],
                        "created_at": now,
                    }
                    await db.annotations.insert_one(ann_doc)
                    imported_annotations_count += 1
                    project_annotation_inc += 1
                    
                    class_id = ann["class_id"]
                    class_annotation_increments[class_id] = class_annotation_increments.get(class_id, 0) + 1

        except Exception as img_err:
            logger.warning(f"Error processing image {img_path} in upload-zip: {img_err}")
            continue

    if imported_images_count == 0:
        raise HTTPException(status_code=400, detail="Failed to import any valid images from the ZIP archive.")

    # 9. Update counts in MongoDB
    await db.projects.update_one(
        {"_id": project_oid},
        {
            "$inc": {
                "image_count": project_image_inc,
                "annotation_count": project_annotation_inc
            },
            "$set": {
                "updated_at": now
            }
        }
    )

    for class_id, inc_val in class_annotation_increments.items():
        if ObjectId.is_valid(class_id):
            await db.class_labels.update_one(
                {"_id": ObjectId(class_id)},
                {"$inc": {"annotation_count": inc_val}}
            )

    # 10. Invalidate caches
    await redis.delete(f"images:project:{project_id}")
    await redis.delete(f"versions:project:{project_id}")

    return {
        "images_count": imported_images_count,
        "annotations_count": imported_annotations_count,
        "classes_created": len(new_class_docs),
        "status": "success"
    }


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

    project_id = image["project_id"]
    
    # Recalculate actual annotation count
    actual_annotation_count = await db.annotations.count_documents({"project_id": project_id})

    # Decrement project image count and update annotation count
    await db.projects.update_one(
        {"_id": ObjectId(project_id)},
        {
            "$inc": {"image_count": -1},
            "$set": {"annotation_count": actual_annotation_count, "updated_at": datetime.utcnow()},
        },
    )

    # Recalculate class label counts for the project
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

    # Decrement project image counts and recalculate annotation counts
    for project_id in project_ids:
        count = len([img for img in images if img["project_id"] == project_id])
        
        # Recalculate actual annotation count
        actual_annotation_count = await db.annotations.count_documents({"project_id": project_id})

        await db.projects.update_one(
            {"_id": ObjectId(project_id)},
            {
                "$inc": {"image_count": -count},
                "$set": {"annotation_count": actual_annotation_count, "updated_at": datetime.utcnow()},
            },
        )

        # Recalculate class label counts for the project
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

    return None
