"""
Image assignment router - assign project images and report member progress.
"""

from datetime import datetime
from typing import List, Optional, Literal

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

from ..core.database import get_database
from ..models.image import ImageResponse, AssignmentStatus
from ..models.user import UserInDB
from ..routers.images import _image_to_response
from ..routers.projects import check_project_access
from ..utils.auth import get_current_user

router = APIRouter(tags=["Assignments"])


class BatchAssignmentPayload(BaseModel):
    image_ids: List[str]
    assigned_to_user_id: str
    due_at: Optional[datetime] = None


class AssignmentUpdatePayload(BaseModel):
    assigned_to_user_id: Optional[str] = None
    due_at: Optional[datetime] = None
    assignment_status: Optional[AssignmentStatus] = None


class UserProgressResponse(BaseModel):
    user_id: str
    email: Optional[str] = None
    full_name: Optional[str] = None
    total_assigned: int
    done: int
    in_progress: int
    overdue: int
    completion_rate: float
    annotation_count: int


async def _ensure_assignment_admin(
    user: UserInDB,
    project: dict,
    db: AsyncIOMotorDatabase,
) -> dict:
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
    if (
        workspace_member
        and workspace_member.get("role") in ["owner", "admin"]
    ) or (project_member and project_member.get("role") == "admin"):
        return workspace
    raise HTTPException(status_code=403, detail="Only admins can assign images")


async def _ensure_assignment_editor(
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
    is_admin = bool(
        workspace_member and workspace_member.get("role") in ["owner", "admin"]
    ) or bool(project_member and project_member.get("role") == "admin")
    if is_admin:
        return
    if image.get("assigned_to_user_id") == user_id:
        return
    raise HTTPException(
        status_code=403,
        detail="Only the assigned user or an admin can update assignment status",
    )


async def _ensure_project_member(
    user_id: str,
    project: dict,
    workspace: dict,
) -> None:
    if any(
        m["user_id"] == user_id and m.get("role") in ["owner", "admin"]
        for m in workspace.get("members", [])
    ):
        return
    if any(
        m["user_id"] == user_id and m.get("role") in ["owner", "admin", "annotator"]
        for m in project.get("members", [])
    ):
        return
    raise HTTPException(
        status_code=400,
        detail="Assignee must be a project admin or annotator",
    )


@router.post("/projects/{project_id}/assignments/batch")
async def batch_assign_images(
    project_id: str,
    payload: BatchAssignmentPayload,
    user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    try:
        project_oid = ObjectId(project_id)
        image_oids = [ObjectId(image_id) for image_id in payload.image_ids]
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid project or image ID")

    project = await db.projects.find_one({"_id": project_oid})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    workspace = await _ensure_assignment_admin(user, project, db)
    await _ensure_project_member(payload.assigned_to_user_id, project, workspace)

    matched = await db.images.count_documents({
        "_id": {"$in": image_oids},
        "project_id": project_id,
    })
    if matched != len(image_oids):
        raise HTTPException(status_code=404, detail="One or more images not found in project")

    now = datetime.utcnow()
    result = await db.images.update_many(
        {"_id": {"$in": image_oids}, "project_id": project_id},
        {
            "$set": {
                "assigned_to_user_id": payload.assigned_to_user_id,
                "assigned_by_user_id": str(user.id),
                "assigned_at": now,
                "due_at": payload.due_at,
                "completed_at": None,
                "assignment_status": "assigned",
            }
        },
    )

    return {"matched_count": result.matched_count, "modified_count": result.modified_count}


@router.patch("/images/{image_id}/assignment")
async def update_image_assignment(
    image_id: str,
    payload: AssignmentUpdatePayload,
    user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> ImageResponse:
    try:
        image_oid = ObjectId(image_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid image ID")

    image = await db.images.find_one({"_id": image_oid})
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    project = await db.projects.find_one({"_id": ObjectId(image["project_id"])})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    assignee_or_due_changed = (
        payload.assigned_to_user_id is not None
        or "due_at" in payload.model_fields_set
    )
    if assignee_or_due_changed:
        workspace = await _ensure_assignment_admin(user, project, db)
        if payload.assigned_to_user_id:
            await _ensure_project_member(payload.assigned_to_user_id, project, workspace)
    else:
        await _ensure_assignment_editor(user, image, project, db)

    update_data = {}
    if payload.assigned_to_user_id is not None:
        update_data.update({
            "assigned_to_user_id": payload.assigned_to_user_id,
            "assigned_by_user_id": str(user.id),
            "assigned_at": datetime.utcnow(),
            "completed_at": None,
            "assignment_status": "assigned" if payload.assigned_to_user_id else "unassigned",
        })
    if "due_at" in payload.model_fields_set:
        update_data["due_at"] = payload.due_at
    if payload.assignment_status is not None:
        update_data["assignment_status"] = payload.assignment_status
        update_data["completed_at"] = datetime.utcnow() if payload.assignment_status == "done" else None
        if payload.assignment_status == "done":
            update_data["status"] = "needs_review"
            update_data["review_status"] = "needs_review"
            update_data["reviewer_id"] = None
            update_data["reviewer_comment"] = None
            update_data["reviewed_at"] = None

    if update_data:
        await db.images.update_one({"_id": image_oid}, {"$set": update_data})
        if payload.assignment_status == "done":
            await db.annotation_audit_logs.insert_one({
                "project_id": image["project_id"],
                "image_id": image_id,
                "annotation_id": None,
                "action": "image_submitted_for_review",
                "actor_user_id": str(user.id),
                "before": {
                    "status": image.get("status"),
                    "review_status": image.get("review_status", "none"),
                    "assignment_status": image.get("assignment_status"),
                },
                "after": {
                    "status": "needs_review",
                    "review_status": "needs_review",
                    "assignment_status": "done",
                },
                "created_at": datetime.utcnow(),
            })

    updated = await db.images.find_one({"_id": image_oid})
    return _image_to_response(updated)


@router.get("/projects/{project_id}/progress/users")
async def get_project_user_progress(
    project_id: str,
    user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> List[UserProgressResponse]:
    try:
        project_oid = ObjectId(project_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid project ID")

    project = await db.projects.find_one({"_id": project_oid})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    workspace = await check_project_access(user, project, db, "viewer")

    active_member_ids = sorted({
        m["user_id"]
        for m in project.get("members", [])
        if m.get("role") in ["owner", "admin", "annotator"]
    } | {
        m["user_id"]
        for m in workspace.get("members", [])
        if m.get("role") in ["owner", "admin"]
    })
    if not active_member_ids:
        return []

    await db.images.update_many(
        {
            "project_id": project_id,
            "assigned_to_user_id": {"$nin": active_member_ids + [None]},
        },
        {
            "$set": {
                "assigned_to_user_id": None,
                "assigned_by_user_id": None,
                "assigned_at": None,
                "due_at": None,
                "completed_at": None,
                "assignment_status": "unassigned",
            }
        },
    )

    now = datetime.utcnow()
    image_rows = await db.images.aggregate([
        {
            "$match": {
                "project_id": project_id,
                "assigned_to_user_id": {"$in": active_member_ids},
            }
        },
        {
            "$group": {
                "_id": "$assigned_to_user_id",
                "total_assigned": {"$sum": 1},
                "done": {"$sum": {"$cond": [{"$eq": ["$assignment_status", "done"]}, 1, 0]}},
                "in_progress": {"$sum": {"$cond": [{"$eq": ["$assignment_status", "in_progress"]}, 1, 0]}},
                "overdue": {
                    "$sum": {
                        "$cond": [
                            {
                                "$and": [
                                    {"$ne": ["$assignment_status", "done"]},
                                    {"$ne": ["$due_at", None]},
                                    {"$lt": ["$due_at", now]},
                                ]
                            },
                            1,
                            0,
                        ]
                    }
                },
            }
        },
    ]).to_list(None)

    annotation_rows = await db.annotations.aggregate([
        {
            "$match": {
                "project_id": project_id,
                "created_by_user_id": {"$in": active_member_ids},
            }
        },
        {"$group": {"_id": "$created_by_user_id", "annotation_count": {"$sum": 1}}},
    ]).to_list(None)
    annotation_counts = {row["_id"]: row["annotation_count"] for row in annotation_rows}

    user_ids = sorted({row["_id"] for row in image_rows} | set(annotation_counts.keys()))
    users = {
        str(doc["_id"]): doc
        for doc in await db.users.find({"_id": {"$in": [ObjectId(uid) for uid in user_ids if ObjectId.is_valid(uid)]}}).to_list(None)
    }
    image_counts = {row["_id"]: row for row in image_rows}

    response = []
    for uid in user_ids:
        counts = image_counts.get(uid, {})
        total = counts.get("total_assigned", 0)
        done = counts.get("done", 0)
        user_doc = users.get(uid)
        response.append(UserProgressResponse(
            user_id=uid,
            email=user_doc.get("email") if user_doc else None,
            full_name=user_doc.get("full_name") if user_doc else None,
            total_assigned=total,
            done=done,
            in_progress=counts.get("in_progress", 0),
            overdue=counts.get("overdue", 0),
            completion_rate=done / total if total else 0,
            annotation_count=annotation_counts.get(uid, 0),
        ))

    return response
