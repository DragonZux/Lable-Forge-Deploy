"""
Dataset Versions router - Create, retrieve, and export dataset versions.
Protected endpoints: all require authentication.
"""

import random
import json
from datetime import datetime
from typing import List
import io
import zipfile
import yaml
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks, UploadFile, File
from fastapi.responses import StreamingResponse
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from ..models.dataset_version import DatasetVersionCreate, DatasetVersionResponse
from ..models.user import UserInDB
from ..models.image import ImageSplit
from ..utils.auth import get_current_user
from ..core.database import get_database
from ..core.redis import get_redis
from ..routers.projects import check_project_access, DEFAULT_CLASS_COLORS
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


def _is_zip_bytes(file_bytes: bytes) -> bool:
    if not file_bytes:
        return False
    return zipfile.is_zipfile(io.BytesIO(file_bytes))


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


def _standardize_dataset_zip(zip_bytes: bytes, project_type: str = "object-detection") -> tuple[bytes, List[str], int, int, int]:
    """
    Standardizes any uploaded dataset ZIP (YOLO, COCO, or Classification folder structure) into the unified Label Forge format.
    Ensures that it contains:
    - data.yaml at the root.
    - {split}/images/ holding image files.
    - {split}/labels/ holding YOLO txt files and annotations.json (COCO format).
    """
    import zipfile
    import json
    import io
    import os
    import yaml
    from PIL import Image as PILImage

    src_zip = zipfile.ZipFile(io.BytesIO(zip_bytes), "r")
    namelist = src_zip.namelist()

    if project_type == "classification":
        generic_names = {"train", "val", "test", "valid", "images", "labels", "dataset", "archive", "content", ""}
        class_names_set = set()
        
        new_zip_buffer = io.BytesIO()
        train_count = 0
        valid_count = 0
        test_count = 0
        
        with zipfile.ZipFile(new_zip_buffer, "w", zipfile.ZIP_DEFLATED) as dest_zip:
            for name in namelist:
                if name.startswith("__MACOSX") or "__macosx" in name.lower():
                    continue
                if name.lower().endswith((".jpg", ".jpeg", ".png", ".bmp", ".webp")):
                    try:
                        img_bytes = src_zip.read(name)
                    except Exception:
                        continue
                    
                    split = "train"
                    path_parts = name.lower().replace("\\", "/").split("/")
                    for part in ["train", "valid", "test"]:
                        if part in path_parts:
                            split = part
                            break
                    if split == "valid" or "val" in path_parts:
                        split = "valid"
                    
                    parent = os.path.basename(os.path.dirname(name.replace("\\", "/"))).strip()
                    if not parent or parent.lower() in generic_names:
                        class_name = "unlabeled"
                    else:
                        class_name = parent
                        class_names_set.add(class_name)
                    
                    safe_filename = os.path.basename(name)
                    
                    dest_zip.writestr(f"{split}/{class_name}/{safe_filename}", img_bytes)
                    
                    if split == "train":
                        train_count += 1
                    elif split == "valid":
                        valid_count += 1
                    elif split == "test":
                        test_count += 1

        class_names = sorted(list(class_names_set))
        return new_zip_buffer.getvalue(), class_names, train_count, valid_count, test_count

    # 1. Check if YOLO format (data.yaml at the root)
    is_yolo = "data.yaml" in namelist

    if is_yolo:
        # Read and parse data.yaml
        yaml_content = src_zip.read("data.yaml").decode("utf-8", errors="ignore")
        data_yaml = yaml.safe_load(yaml_content)
        if not isinstance(data_yaml, dict):
            raise ValueError("Invalid data.yaml file inside ZIP.")
        
        names = data_yaml.get("names")
        if not names:
            raise ValueError("Missing 'names' inside data.yaml.")
        
        if isinstance(names, dict):
            class_names = [names[k] for k in sorted(names.keys())]
        elif isinstance(names, list):
            class_names = names
        else:
            raise ValueError("Invalid 'names' format in data.yaml.")
        
        new_zip_buffer = io.BytesIO()
        train_count = 0
        valid_count = 0
        test_count = 0

        with zipfile.ZipFile(new_zip_buffer, "w", zipfile.ZIP_DEFLATED) as dest_zip:
            for split in ["train", "valid", "test"]:
                # Find all images for this split in the ZIP
                split_images = []
                for name in namelist:
                    if name.lower().startswith(f"{split}/") and name.lower().endswith((".jpg", ".jpeg", ".png", ".bmp", ".webp")):
                        if not name.lower().startswith(f"{split}/labels/") and "__macosx" not in name.lower():
                            split_images.append(name)

                if not split_images:
                    continue

                coco_images = []
                coco_annotations = []

                for idx, img_path in enumerate(split_images):
                    try:
                        img_bytes = src_zip.read(img_path)
                        img = PILImage.open(io.BytesIO(img_bytes))
                        width, height = img.size
                    except Exception:
                        continue

                    safe_filename = os.path.basename(img_path)
                    safe_filename_no_ext = os.path.splitext(safe_filename)[0]

                    # Write image to new ZIP
                    dest_zip.writestr(f"{split}/images/{safe_filename}", img_bytes)

                    if split == "train":
                        train_count += 1
                    elif split == "valid":
                        valid_count += 1
                    elif split == "test":
                        test_count += 1

                    # Look for YOLO label txt file
                    possible_txt_paths = [
                        f"{split}/labels/{safe_filename_no_ext}.txt",
                        f"{split}/{safe_filename_no_ext}.txt",
                    ]
                    
                    txt_bytes = None
                    for path in possible_txt_paths:
                        if path in namelist:
                            txt_bytes = src_zip.read(path)
                            break
                    
                    if not txt_bytes:
                        for name in namelist:
                            if name.startswith(f"{split}/") and name.endswith(f"/{safe_filename_no_ext}.txt"):
                                txt_bytes = src_zip.read(name)
                                break

                    if txt_bytes:
                        dest_zip.writestr(f"{split}/labels/{safe_filename_no_ext}.txt", txt_bytes)
                        
                        txt_str = txt_bytes.decode("utf-8", errors="ignore")
                        for line in txt_str.strip().split("\n"):
                            parts = line.strip().split()
                            if len(parts) >= 5:
                                try:
                                    class_idx = int(parts[0])
                                    x_center = float(parts[1])
                                    y_center = float(parts[2])
                                    w_norm = float(parts[3])
                                    h_norm = float(parts[4])

                                    w = w_norm * width
                                    h = h_norm * height
                                    x_min = (x_center - w_norm / 2) * width
                                    y_min = (y_center - h_norm / 2) * height

                                    coco_annotations.append({
                                        "id": len(coco_annotations) + 1,
                                        "image_id": idx + 1,
                                        "category_id": class_idx + 1,
                                        "bbox": [round(x_min, 2), round(y_min, 2), round(w, 2), round(h, 2)],
                                        "area": round(w * h, 2),
                                        "iscrowd": 0
                                    })
                                except Exception:
                                    continue
                    else:
                        dest_zip.writestr(f"{split}/labels/{safe_filename_no_ext}.txt", b"")

                    coco_images.append({
                        "id": idx + 1,
                        "file_name": safe_filename,
                        "width": width,
                        "height": height
                    })

                split_coco_data = {
                    "images": coco_images,
                    "annotations": coco_annotations,
                    "categories": [{"id": i + 1, "name": name} for i, name in enumerate(class_names)]
                }
                dest_zip.writestr(f"{split}/labels/annotations.json", json.dumps(split_coco_data, indent=2))

            val_path = "./valid/images" if valid_count else "./train/images"
            test_path = "./test/images" if test_count else val_path
            yaml_content = f"train: ./train/images\nval: {val_path}\ntest: {test_path}\n\nc: {len(class_names)}\nnames: {class_names}\n"
            dest_zip.writestr("data.yaml", yaml_content)

        return new_zip_buffer.getvalue(), class_names, train_count, valid_count, test_count

    else:
        # 2. Check if COCO format
        json_paths = {}
        for name in namelist:
            name_lower = name.lower()
            if name_lower.endswith(".json") and not name_lower.startswith("__macosx"):
                for split in ["train", "valid", "test"]:
                    if f"{split}/" in name_lower or f"{split}\\" in name_lower:
                        json_paths[split] = name
                        break

        if not json_paths:
            for name in namelist:
                if name.lower().endswith(".json") and "/" not in name and "\\" not in name:
                    json_paths["train"] = name
                    break

        if not json_paths:
            raise ValueError("No COCO JSON annotation files or data.yaml found inside the ZIP.")

        class_names = []
        cat_id_to_idx = {}
        for split in ["train", "valid", "test"]:
            if split in json_paths:
                try:
                    coco_data = json.loads(src_zip.read(json_paths[split]).decode("utf-8", errors="ignore"))
                    categories = coco_data.get("categories", [])
                    categories_sorted = sorted(categories, key=lambda x: x.get("id", 0))
                    class_names = [cat["name"] for cat in categories_sorted]
                    cat_id_to_idx = {cat["id"]: idx for idx, cat in enumerate(categories_sorted)}
                    if class_names:
                        break
                except Exception:
                    continue

        if not class_names:
            raise ValueError("Could not parse class names from categories in COCO JSON.")

        new_zip_buffer = io.BytesIO()
        train_count = 0
        valid_count = 0
        test_count = 0

        with zipfile.ZipFile(new_zip_buffer, "w", zipfile.ZIP_DEFLATED) as dest_zip:
            for split in ["train", "valid", "test"]:
                if split not in json_paths:
                    continue

                try:
                    coco_data = json.loads(src_zip.read(json_paths[split]).decode("utf-8", errors="ignore"))
                except Exception:
                    continue

                images_map = {img["id"]: img for img in coco_data.get("images", [])}
                
                annotations_by_img = {}
                for ann in coco_data.get("annotations", []):
                    img_id = ann.get("image_id")
                    if img_id not in annotations_by_img:
                        annotations_by_img[img_id] = []
                    annotations_by_img[img_id].append(ann)

                for img_id, img_doc in images_map.items():
                    orig_filename = img_doc["file_name"]
                    safe_filename = os.path.basename(orig_filename)
                    
                    json_dir = os.path.dirname(json_paths[split])
                    possible_paths = [
                        os.path.join(json_dir, safe_filename).replace("\\", "/"),
                        os.path.join(json_dir, orig_filename).replace("\\", "/"),
                        f"{split}/{safe_filename}",
                        f"{split}/{orig_filename}",
                    ]
                    
                    img_data = None
                    for path in possible_paths:
                        if path in namelist:
                            img_data = src_zip.read(path)
                            break
                    
                    if not img_data:
                        for name in namelist:
                            if name.startswith(f"{split}/") and os.path.basename(name) == safe_filename:
                                img_data = src_zip.read(name)
                                break

                    if not img_data:
                        continue

                    dest_zip.writestr(f"{split}/images/{safe_filename}", img_data)

                    if split == "train":
                        train_count += 1
                    elif split == "valid":
                        valid_count += 1
                    elif split == "test":
                        test_count += 1

                    img_w = img_doc.get("width", 0)
                    img_h = img_doc.get("height", 0)
                    yolo_lines = []
                    
                    img_annotations = annotations_by_img.get(img_id, [])
                    for ann in img_annotations:
                        cat_id = ann.get("category_id")
                        class_idx = cat_id_to_idx.get(cat_id)
                        if class_idx is None:
                            continue
                        
                        bbox = ann.get("bbox")
                        if not bbox or len(bbox) < 4:
                            continue
                        
                        x_min, y_min, w, h = bbox
                        if img_w <= 0 or img_h <= 0:
                            continue
                        
                        x_center = (x_min + w / 2) / img_w
                        y_center = (y_min + h / 2) / img_h
                        w_norm = w / img_w
                        h_norm = h / img_h
                        
                        x_center = max(0.0, min(1.0, x_center))
                        y_center = max(0.0, min(1.0, y_center))
                        w_norm = max(0.0, min(1.0, w_norm))
                        h_norm = max(0.0, min(1.0, h_norm))
                        
                        yolo_lines.append(f"{class_idx} {x_center:.6f} {y_center:.6f} {w_norm:.6f} {h_norm:.6f}\n")

                    label_filename = os.path.splitext(safe_filename)[0] + ".txt"
                    dest_zip.writestr(f"{split}/labels/{label_filename}", "".join(yolo_lines))

                dest_zip.writestr(f"{split}/labels/annotations.json", src_zip.read(json_paths[split]))

            val_path = "./valid/images" if valid_count else "./train/images"
            test_path = "./test/images" if test_count else val_path
            yaml_content = f"train: ./train/images\nval: {val_path}\ntest: {test_path}\n\nc: {len(class_names)}\nnames: {class_names}\n"
            dest_zip.writestr("data.yaml", yaml_content)

        return new_zip_buffer.getvalue(), class_names, train_count, valid_count, test_count


@router.post("/import", status_code=201)
async def import_version(
    project_id: str = Query(...),
    file: UploadFile = File(...),
    user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
    redis=Depends(get_redis),
) -> DatasetVersionResponse:
    """
    Import an existing zip file as a dataset version.
    Standardizes both YOLO (with data.yaml) or Roboflow COCO into the unified Label Forge format.
    Uploads zip to storage, maps class labels, and registers as ready version.
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
    project_type = project.get("type", "object-detection")
    try:
        file_bytes, class_names, train_count, valid_count, test_count = _standardize_dataset_zip(file_bytes, project_type)
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to automatically process and standardize dataset ZIP file: {str(e)}"
        )

    # 3. Handle classes in database
    existing_classes = await db.class_labels.find({"project_id": project_id}).to_list(None)
    existing_names_lower = {c["name"].lower(): c for c in existing_classes}
    
    now = datetime.utcnow()
    
    # Ensure all class names from data.yaml exist in db
    new_class_docs = []
    for idx, cname in enumerate(class_names):
        cname_clean = cname.strip()
        if not cname_clean:
            continue
        if cname_clean.lower() not in existing_names_lower:
            color = DEFAULT_CLASS_COLORS[idx % len(DEFAULT_CLASS_COLORS)]
            new_class_docs.append({
                "project_id": project_id,
                "name": cname_clean,
                "color": color,
                "annotation_count": 0,
                "created_at": now,
            })
            
    if new_class_docs:
        await db.class_labels.insert_many(new_class_docs)

    # 4. Get next version number
    last_version = await db.dataset_versions.find_one(
        {"project_id": project_id},
        sort=[("version_number", -1)],
    )
    next_version_number = (last_version["version_number"] if last_version else 0) + 1

    # 5. Create version document
    version_doc = {
        "project_id": project_id,
        "version_number": next_version_number,
        "preprocessing": {
            "resize": None,
            "grayscale": False,
            "auto_orient": False,
        },
        "augmentation": {
            "flip_horizontal": False,
            "flip_vertical": False,
            "rotation": 0,
            "brightness": 0.0,
            "blur": 0.0,
            "noise": 0.0,
        },
        "train_count": train_count,
        "valid_count": valid_count,
        "test_count": test_count,
        "status": "ready",
        "processing_progress": 100,
        "zip_url": None,
        "created_at": now,
    }

    result = await db.dataset_versions.insert_one(version_doc)
    version_id = str(result.inserted_id)
    version_doc["_id"] = result.inserted_id

    # 6. Upload file to storage with filename version_{version_id}.zip
    workspace_id = project.get("workspace_id", "default_workspace")
    zip_filename = f"workspaces/{workspace_id}/projects/{project_id}/exports/version_{version_id}.zip"
    try:
        from ..core.storage import storage_client
        zip_url = storage_client.upload_file(
            file_bytes=file_bytes,
            filename=zip_filename,
            content_type="application/zip"
        )
    except Exception as e:
        await db.dataset_versions.delete_one({"_id": result.inserted_id})
        raise HTTPException(
            status_code=500,
            detail=f"Failed to upload zip dataset to storage: {str(e)}"
        )

    # 7. Update document with the uploaded zip_url
    await db.dataset_versions.update_one(
        {"_id": result.inserted_id},
        {"$set": {"zip_url": zip_url}}
    )
    version_doc["zip_url"] = zip_url

    # 8. Invalidate redis cache for versions list
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
    project_id = version["project_id"]
    project = await db.projects.find_one({"_id": ObjectId(project_id)})
    workspace_id = project.get("workspace_id", "default_workspace") if project else "default_workspace"
    new_zip_filename = f"workspaces/{workspace_id}/projects/{project_id}/exports/version_{version_id}.zip"
    old_zip_filename = f"projects/{project_id}/exports/version_{version_id}.zip"
    root_zip_filename = f"version_{version_id}.zip"

    try:
        try:
            file_bytes = storage_client.download_file(new_zip_filename)
            storage_key = new_zip_filename
        except Exception:
            try:
                file_bytes = storage_client.download_file(old_zip_filename)
                storage_key = old_zip_filename
            except Exception:
                try:
                    file_bytes = storage_client.download_file(root_zip_filename)
                    storage_key = root_zip_filename
                except Exception as exc:
                    raise exc
        if not _is_zip_bytes(file_bytes):
            raise ValueError(
                f"Stored dataset artifact is not a valid ZIP file: {storage_key}"
            )
        return StreamingResponse(
            io.BytesIO(file_bytes),
            media_type="application/zip",
            headers={
                "Content-Disposition": f"attachment; filename=version_{version_id}.zip",
                "Content-Length": str(len(file_bytes)),
                "X-Content-Type-Options": "nosniff",
            }
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve dataset ZIP: {str(e)}"
        )
