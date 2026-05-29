"""
Health Check router - Project health metrics and analysis.
Protected endpoints: all require authentication.
"""

from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase
from collections import Counter, defaultdict

from ..models.user import UserInDB
from ..utils.auth import get_current_user
from ..core.database import get_database
from ..core.redis import get_redis
from ..routers.projects import check_project_access

router = APIRouter(prefix="/health", tags=["Health Check"])


@router.get("/project/{project_id}")
async def get_project_health(
    project_id: str,
    refresh: bool = Query(False),
    user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
    redis=Depends(get_redis),
) -> dict:
    """
    Get comprehensive health metrics for a project.
    Includes class balance, split distribution, annotation stats, and issues.
    Results cached for 10 minutes.
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
    await check_project_access(user, project, db, "reviewer")

    # Try cache first (unless force refreshing)
    cache_key = f"health:project:{project_id}"
    if not refresh:
        cached = await redis.get(cache_key)
        if cached:
            import json

            return json.loads(cached)

    # Get all images
    images = await db.images.find({"project_id": project_id}).to_list(None)
    total_images = len(images)

    # Split distribution
    split_counts = {
        "train": 0,
        "valid": 0,
        "test": 0,
        "unassigned": 0,
    }
    for img in images:
        split = img.get("split", "unassigned")
        if split in split_counts:
            split_counts[split] += 1

    # Get all annotations
    annotations = await db.annotations.find(
        {"project_id": project_id}
    ).to_list(None)

    # Class balance
    class_counts = Counter(ann["class_name"] for ann in annotations)
    class_balance = [
        {
            "name": name,
            "count": count,
            "percentage": round(
                (count / len(annotations) * 100) if annotations else 0, 2
            ),
        }
        for name, count in class_counts.items()
    ]
    class_balance = sorted(class_balance, key=lambda x: x["count"], reverse=True)

    # Annotation types
    annotation_types = Counter(ann["type"] for ann in annotations)
    annotation_types_dict = dict(annotation_types)

    # Images without annotations
    annotated_image_ids = set(ann["image_id"] for ann in annotations)
    images_without_annotations = total_images - len(annotated_image_ids)

    # Average annotations per image
    avg_annotations_per_image = round(
        len(annotations) / total_images if total_images > 0 else 0, 2
    )

    # Image size distribution
    sizes = []
    for img in images:
        area = img.get("width", 0) * img.get("height", 0)
        if area < 256 * 256:  # < 256x256
            sizes.append("small")
        elif area < 512 * 512:  # < 512x512
            sizes.append("medium")
        else:
            sizes.append("large")

    size_counts = Counter(sizes)
    image_size_distribution = [
        {"label": label, "count": count}
        for label, count in [
            ("small (<256x256)", size_counts.get("small", 0)),
            ("medium (256-512)", size_counts.get("medium", 0)),
            ("large (>512)", size_counts.get("large", 0)),
        ]
    ]

    # Issues detection
    issues = []
    validation = {
        "duplicate_images": [],
        "small_boxes": [],
        "large_boxes": [],
        "out_of_bounds_annotations": [],
        "unused_classes": [],
        "unassigned_images": [],
        "class_split_imbalance": [],
    }

    # Check class imbalance
    if class_balance:
        max_count = class_balance[0]["count"]
        min_count = class_balance[-1]["count"]
        if min_count > 0 and max_count / min_count > 10:
            issues.append(
                {
                    "type": "class_imbalance",
                    "message": f"High class imbalance: {class_balance[0]['name']} ({max_count}) vs {class_balance[-1]['name']} ({min_count})",
                    "severity": "warning",
                }
            )

    # Check insufficient annotations
    unannotated_percent = (
        (images_without_annotations / total_images * 100)
        if total_images > 0
        else 0
    )
    if unannotated_percent > 50:
        issues.append(
            {
                "type": "insufficient_annotations",
                "message": f"{unannotated_percent:.1f}% of images lack annotations",
                "severity": "error",
            }
        )

    # Check if no images
    if total_images == 0:
        issues.append(
            {
                "type": "no_images",
                "message": "Project has no images",
                "severity": "error",
            }
        )

    # Check if unassigned images
    if split_counts["unassigned"] > 0:
        validation["unassigned_images"] = [
            {
                "image_id": str(img["_id"]),
                "filename": img.get("original_filename"),
            }
            for img in images
            if img.get("split", "unassigned") == "unassigned"
        ][:25]
        issues.append(
            {
                "type": "unassigned_images",
                "message": f"{split_counts['unassigned']} images not assigned to train/valid/test",
                "severity": "warning",
            }
        )

    # Check unbalanced splits
    assigned_total = (
        split_counts["train"]
        + split_counts["valid"]
        + split_counts["test"]
    )
    if assigned_total > 0:
        train_pct = split_counts["train"] / assigned_total * 100
        if train_pct < 60:
            issues.append(
                {
                    "type": "imbalanced_splits",
                    "message": f"Train split {train_pct:.1f}% < 60% recommended",
                    "severity": "warning",
                }
            )

    image_by_id = {str(img["_id"]): img for img in images}
    duplicate_groups = defaultdict(list)
    for img in images:
        duplicate_groups[(img.get("original_filename", "").lower(), img.get("width"), img.get("height"))].append(img)
    validation["duplicate_images"] = [
        {
            "filename": key[0],
            "count": len(group),
            "image_ids": [str(img["_id"]) for img in group[:10]],
        }
        for key, group in duplicate_groups.items()
        if key[0] and len(group) > 1
    ][:25]
    if validation["duplicate_images"]:
        issues.append({
            "type": "duplicate_images",
            "message": f"{len(validation['duplicate_images'])} duplicate filename/dimension groups detected",
            "severity": "warning",
        })

    classes = await db.class_labels.find({"project_id": project_id}).to_list(None)
    used_class_ids = {ann.get("class_id") for ann in annotations}
    validation["unused_classes"] = [
        {"class_id": str(cls["_id"]), "name": cls.get("name")}
        for cls in classes
        if str(cls["_id"]) not in used_class_ids
    ]
    if validation["unused_classes"]:
        issues.append({
            "type": "unused_classes",
            "message": f"{len(validation['unused_classes'])} classes have no annotations",
            "severity": "warning",
        })

    class_split_counts = defaultdict(lambda: {"train": 0, "valid": 0, "test": 0, "unassigned": 0})
    for ann in annotations:
        img = image_by_id.get(ann.get("image_id"))
        if not img:
            continue
        split = img.get("split", "unassigned")
        class_split_counts[ann.get("class_name", "unknown")][split] += 1

        coords = ann.get("coordinates") or {}
        points = coords.get("points") if isinstance(coords, dict) else None
        box = None
        if isinstance(coords, dict) and all(key in coords for key in ["x", "y", "width", "height"]):
            box = coords
        if box:
            width = img.get("width", 0) or 1
            height = img.get("height", 0) or 1
            area_ratio = (box.get("width", 0) * box.get("height", 0)) / (width * height)
            row = {
                "image_id": ann.get("image_id"),
                "annotation_id": str(ann["_id"]),
                "class_name": ann.get("class_name"),
                "area_percent": round(area_ratio * 100, 3),
                "filename": img.get("original_filename") or img.get("filename"),
            }
            if area_ratio < 0.001:
                validation["small_boxes"].append(row)
            if area_ratio > 0.85:
                validation["large_boxes"].append(row)
            if (
                box.get("x", 0) < 0
                or box.get("y", 0) < 0
                or box.get("x", 0) + box.get("width", 0) > width
                or box.get("y", 0) + box.get("height", 0) > height
            ):
                validation["out_of_bounds_annotations"].append(row)
        if points:
            width = img.get("width", 0)
            height = img.get("height", 0)
            if any(point[0] < 0 or point[1] < 0 or point[0] > width or point[1] > height for point in points if len(point) >= 2):
                validation["out_of_bounds_annotations"].append({
                    "image_id": ann.get("image_id"),
                    "annotation_id": str(ann["_id"]),
                    "class_name": ann.get("class_name"),
                    "type": ann.get("type"),
                    "filename": img.get("original_filename") or img.get("filename"),
                })

    for key in ["small_boxes", "large_boxes", "out_of_bounds_annotations"]:
        validation[key] = validation[key][:50]
    if validation["small_boxes"]:
        issues.append({
            "type": "small_boxes",
            "message": f"{len(validation['small_boxes'])} bounding boxes are extremely small",
            "severity": "warning",
        })
    if validation["large_boxes"]:
        issues.append({
            "type": "large_boxes",
            "message": f"{len(validation['large_boxes'])} bounding boxes are extremely large",
            "severity": "warning",
        })
    if validation["out_of_bounds_annotations"]:
        issues.append({
            "type": "out_of_bounds_annotations",
            "message": f"{len(validation['out_of_bounds_annotations'])} annotations exceed image boundaries",
            "severity": "error",
        })

    for class_name, counts in class_split_counts.items():
        assigned = counts["train"] + counts["valid"] + counts["test"]
        if assigned >= 5 and (counts["train"] == 0 or counts["valid"] == 0):
            validation["class_split_imbalance"].append({
                "class_name": class_name,
                "split_counts": counts,
            })
    if validation["class_split_imbalance"]:
        issues.append({
            "type": "class_split_imbalance",
            "message": f"{len(validation['class_split_imbalance'])} classes are missing from train or valid split",
            "severity": "warning",
        })

    # Sync project statistics to prevent count discrepancies
    actual_annotation_count = len(annotations)
    if project.get("annotation_count") != actual_annotation_count or project.get("image_count") != total_images:
        await db.projects.update_one(
            {"_id": project_oid},
            {"$set": {
                "annotation_count": actual_annotation_count,
                "image_count": total_images
            }}
        )

    result = {
        "project_id": project_id,
        "project_type": project.get("type", "object-detection"),
        "timestamp": datetime.utcnow().isoformat(),
        "summary": {
            "total_images": total_images,
            "annotated_images": len(annotated_image_ids),
            "annotated_percent": round(
                (len(annotated_image_ids) / total_images * 100)
                if total_images > 0
                else 0,
                2,
            ),
            "total_annotations": len(annotations),
            "avg_annotations_per_image": avg_annotations_per_image,
        },
        "class_balance": class_balance,
        "split_distribution": split_counts,
        "annotation_types": annotation_types_dict,
        "images_without_annotations": images_without_annotations,
        "image_size_distribution": image_size_distribution,
        "validation": validation,
        "issues": issues,
    }

    # Cache for 10 minutes
    import json

    await redis.setex(cache_key, 600, json.dumps(result, default=str))

    return result
