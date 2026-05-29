from __future__ import annotations

import io
import zipfile
import os
import shutil
import tempfile
import json
import logging
from PIL import Image as PILImage
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase
from ..core.storage import storage_client

logger = logging.getLogger(__name__)


def _safe_filename(filename: str) -> str:
    return os.path.basename(filename).replace("\\", "_").replace("/", "_")


def _transform_bbox(coords: dict, original_size: tuple[int, int], output_size: tuple[int, int], augmentation: dict) -> tuple[float, float, float, float]:
    x = float(coords.get("x", 0))
    y = float(coords.get("y", 0))
    w = float(coords.get("width", 0))
    h = float(coords.get("height", 0))

    original_w, original_h = original_size
    output_w, output_h = output_size
    scale_x = output_w / original_w if original_w else 1
    scale_y = output_h / original_h if original_h else 1

    x *= scale_x
    y *= scale_y
    w *= scale_x
    h *= scale_y

    if augmentation.get("flip_horizontal"):
        x = output_w - x - w
    if augmentation.get("flip_vertical"):
        y = output_h - y - h

    x = max(0, min(x, output_w))
    y = max(0, min(y, output_h))
    w = max(0, min(w, output_w - x))
    h = max(0, min(h, output_h - y))
    return x, y, w, h


class DatasetService:
    @staticmethod
    async def process_dataset_version(
        db: AsyncIOMotorDatabase,
        version_id: str,
    ):
        """
        Background task to process images, generate labels, and create a ZIP.
        """
        version = await db.dataset_versions.find_one({"_id": ObjectId(version_id)})
        if not version:
            return

        project_id = version["project_id"]
        preprocessing = version.get("preprocessing", {})
        augmentation = version.get("augmentation", {})
        version_oid = ObjectId(version_id)

        project = await db.projects.find_one({"_id": ObjectId(project_id)})
        if not project:
            return
        project_type = project.get("type", "object-detection")

        if project_type != "classification" and augmentation.get("rotation", 0):
            await db.dataset_versions.update_one(
                {"_id": version_oid},
                {
                    "$set": {
                        "status": "failed",
                        "error_message": "Rotation export is not supported yet because bounding boxes must be geometrically transformed.",
                    }
                },
            )
            return
        
        # Get all images for this project that have a split
        images_cursor = db.images.find({"project_id": project_id, "split": {"$in": ["train", "valid", "test"]}})
        images = await images_cursor.to_list(None)
        total_images = len(images)
        
        if total_images == 0:
            await db.dataset_versions.update_one(
                {"_id": version_oid},
                {"$set": {"status": "ready", "processing_progress": 100}}
            )
            return

        # Fetch class labels for mapping
        classes_cursor = db.class_labels.find({"project_id": project_id})
        classes = await classes_cursor.to_list(None)
        class_map = {str(c["_id"]): i for i, c in enumerate(classes)}
        class_names = [c["name"] for c in classes]
        class_id_to_name = {str(c["_id"]): c["name"] for c in classes}

        # COCO initialization
        img_idx_map = {str(img["_id"]): i+1 for i, img in enumerate(images)}
        split_coco_data = {}
        if project_type != "classification":
            split_coco_data = {
                split: {
                    "images": [],
                    "annotations": [],
                    "categories": [{"id": i+1, "name": name} for i, name in enumerate(class_names)]
                } for split in ["train", "valid", "test"]
            }

        temp_dir = tempfile.mkdtemp(prefix=f"labelforge_version_{version_id}_")
        zip_path = os.path.join(tempfile.gettempdir(), f"version_{version_id}.zip")
        
        try:
            # Create folder structures
            if project_type != "classification":
                for split in ["train", "valid", "test"]:
                    os.makedirs(os.path.join(temp_dir, split, "images"), exist_ok=True)
                    os.makedirs(os.path.join(temp_dir, split, "labels"), exist_ok=True)

            processed_count = 0
            for img_doc in images:
                split = img_doc["split"]
                filename = img_doc["filename"]
                orig_filename = _safe_filename(img_doc["original_filename"])
                
                try:
                    file_bytes = storage_client.download_file(filename)
                    img = PILImage.open(io.BytesIO(file_bytes))
                    original_size = img.size
                    
                    if preprocessing.get("auto_orient"):
                        from PIL import ImageOps
                        img = ImageOps.exif_transpose(img)
                        original_size = img.size
                        
                    if preprocessing.get("grayscale"):
                        img = img.convert("L")
                        
                    resize_dim = preprocessing.get("resize")
                    if resize_dim:
                        img = img.resize((resize_dim, resize_dim), PILImage.Resampling.LANCZOS)
                    
                    # Apply Augmentation
                    if augmentation.get("flip_horizontal"):
                        img = img.transpose(PILImage.FLIP_LEFT_RIGHT)
                    if augmentation.get("flip_vertical"):
                        img = img.transpose(PILImage.FLIP_TOP_BOTTOM)
                    
                    bright_val = augmentation.get("brightness", 0)
                    if bright_val:
                        from PIL import ImageEnhance
                        enhancer = ImageEnhance.Brightness(img)
                        img = enhancer.enhance(1 + (bright_val / 100))
                        
                    blur_val = augmentation.get("blur", 0)
                    if blur_val:
                        from PIL import ImageFilter
                        img = img.filter(ImageFilter.GaussianBlur(radius=blur_val))
                    
                    annotations_cursor = db.annotations.find({"image_id": str(img_doc["_id"])})
                    annotations = await annotations_cursor.to_list(None)

                    if project_type == "classification":
                        class_name = "unlabeled"
                        for ann in annotations:
                            if ann.get("type") == "classification":
                                cid = ann.get("class_id")
                                if cid in class_id_to_name:
                                    class_name = class_id_to_name[cid]
                                    break
                        class_dir = os.path.join(temp_dir, split, class_name)
                        os.makedirs(class_dir, exist_ok=True)
                        processed_img_path = os.path.join(class_dir, orig_filename)
                    else:
                        split_coco_data[split]["images"].append({
                            "id": img_idx_map[str(img_doc["_id"])],
                            "file_name": orig_filename,
                            "width": img.width,
                            "height": img.height
                        })
                        processed_img_path = os.path.join(temp_dir, split, "images", orig_filename)

                    img.save(processed_img_path)
                    
                    if project_type != "classification":
                        label_path = os.path.join(temp_dir, split, "labels", os.path.splitext(orig_filename)[0] + ".txt")
                        img_w, img_h = img.size
                        
                        with open(label_path, "w") as f:
                            for ann in annotations:
                                class_idx = class_map.get(ann["class_id"])
                                if class_idx is None:
                                    continue
                                
                                if ann["type"] == "bbox":
                                    x, y, w, h = _transform_bbox(
                                        ann.get("coordinates") or {},
                                        original_size,
                                        (img_w, img_h),
                                        augmentation,
                                    )
                                    if w <= 0 or h <= 0:
                                        continue
                                    x_center = (x + w/2) / img_w
                                    y_center = (y + h/2) / img_h
                                    w_norm = w / img_w
                                    h_norm = h / img_h
                                    f.write(f"{class_idx} {x_center:.6f} {y_center:.6f} {w_norm:.6f} {h_norm:.6f}\n")
                                    
                                    split_coco_data[split]["annotations"].append({
                                        "id": len(split_coco_data[split]["annotations"]) + 1,
                                        "image_id": img_idx_map[str(img_doc["_id"])],
                                        "category_id": class_idx + 1,
                                        "bbox": [x, y, w, h],
                                        "area": w * h,
                                        "iscrowd": 0
                                    })
                except Exception as e:
                    logger.warning("Error processing image %s: %s", filename, e)
                
                processed_count += 1
                if processed_count % 5 == 0:
                    progress = int((processed_count / total_images) * 90)
                    await db.dataset_versions.update_one(
                        {"_id": version_oid},
                        {"$set": {"processing_progress": progress}}
                    )

            if project_type != "classification":
                for split in ["train", "valid", "test"]:
                    coco_path = os.path.join(temp_dir, split, "labels", "annotations.json")
                    with open(coco_path, "w") as f:
                        json.dump(split_coco_data[split], f, indent=2)

                # Create data.yaml for YOLO
                split_counts = {
                    split: len(split_coco_data[split]["images"])
                    for split in ["train", "valid", "test"]
                }
                val_path = "./valid/images" if split_counts["valid"] else "./train/images"
                test_path = (
                    "./test/images"
                    if split_counts["test"]
                    else val_path
                )
                yaml_content = f"train: ./train/images\nval: {val_path}\ntest: {test_path}\n\nnc: {len(class_names)}\nnames: {class_names}\n"
                with open(os.path.join(temp_dir, "data.yaml"), "w") as f:
                    f.write(yaml_content)

            workspace_id = project.get("workspace_id", "default_workspace") if project else "default_workspace"
            zip_filename = f"workspaces/{workspace_id}/projects/{project_id}/exports/version_{version_id}.zip"
            with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
                for root, dirs, files in os.walk(temp_dir):
                    for file in files:
                        file_path = os.path.join(root, file)
                        arcname = os.path.relpath(file_path, temp_dir)
                        zipf.write(file_path, arcname)

            with open(zip_path, "rb") as f:
                zip_url = storage_client.upload_file(
                    file_bytes=f.read(),
                    filename=zip_filename,
                    content_type="application/zip"
                )

            await db.dataset_versions.update_one(
                {"_id": version_oid},
                {
                    "$set": {
                        "status": "ready",
                        "processing_progress": 100,
                        "zip_url": zip_url
                    }
                }
            )
        except Exception as exc:
            await db.dataset_versions.update_one(
                {"_id": version_oid},
                {
                    "$set": {
                        "status": "failed",
                        "error_message": str(exc),
                    }
                },
            )
        finally:
            if os.path.exists(temp_dir):
                shutil.rmtree(temp_dir)
            if os.path.exists(zip_path):
                os.remove(zip_path)
