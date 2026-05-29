"""
Projects router — CRUD operations for projects within workspaces.
Protected endpoints: all require authentication.
"""

from datetime import datetime, timedelta
from typing import Literal, List
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from ..models.project import ProjectCreate, ProjectResponse, ProjectMemberUpdate, ProjectUpdate
from ..models.class_label import ClassLabelCreate, ClassLabelResponse, ClassLabelUpdate, ClassLabelMerge
from ..models.image import ImageResponse
from ..models.user import UserInDB
from ..utils.auth import get_current_user
from ..utils.cache import cache_response
from ..core.database import get_database
from ..core.config import settings
from ..core.redis import get_redis, cache_delete
from ..core.storage import storage_client
from ..models.project_invitation import ProjectInvitationResponse, ProjectInvitationInDB
from ..services.notification_service import NotificationService

router = APIRouter(prefix="/projects", tags=["Projects"])

ProjectAccessRole = Literal["admin", "annotator", "reviewer", "viewer"]
DEFAULT_CLASS_COLORS = [
    "#2563eb",
    "#16a34a",
    "#f59e0b",
    "#dc2626",
    "#7c3aed",
    "#0891b2",
    "#db2777",
    "#65a30d",
]


async def check_workspace_access(
    user: UserInDB,
    workspace_id: str,
    db: AsyncIOMotorDatabase,
    required_role: Literal["owner", "admin", "member", "viewer"] = "member",
) -> dict:
    """
    Check if user has access to workspace with minimum role.
    Returns workspace document if authorized, raises 403 if not.
    """
    workspace = await db.workspaces.find_one({"_id": ObjectId(workspace_id)})
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")

    user_id = str(user.id)
    # Check if user is member
    member = next(
        (m for m in workspace.get("members", []) if m["user_id"] == user_id),
        None,
    )
    
    if not member:
        raise HTTPException(status_code=403, detail="Access denied to workspace")

    # Role hierarchy: owner > admin > member > viewer
    role_hierarchy = {"owner": 4, "admin": 3, "member": 2, "viewer": 1}
    if role_hierarchy.get(member["role"], 0) < role_hierarchy.get(required_role, 0):
        # Special case: allow invited users to view even if member role is required, 
        # but only for GET requests (handled by checking method or just being permissive here 
        # and relying on individual endpoint roles)
        # However, to be safe and fulfill "only for viewing", we keep it strict 
        # but we will update the GET endpoints to require only "viewer".
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    return workspace


async def check_project_access(
    user: UserInDB,
    project: dict,
    db: AsyncIOMotorDatabase,
    required_role: ProjectAccessRole = "viewer",
) -> dict:
    """
    Check project-level access.

    Workspace owner/admin are project admins. Workspace members get viewer access
    unless they have an explicit project role.
    """
    workspace = await db.workspaces.find_one({"_id": ObjectId(project["workspace_id"])})
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")

    user_id = str(user.id)
    workspace_member = next(
        (m for m in workspace.get("members", []) if m["user_id"] == user_id),
        None,
    )
    project_member = next(
        (m for m in project.get("members", []) if m["user_id"] == user_id),
        None,
    )

    if workspace_member and workspace_member["role"] in ["owner", "admin"]:
        effective_role = "admin"
    elif project_member:
        effective_role = project_member["role"]
    elif workspace_member:
        effective_role = "viewer"
    else:
        raise HTTPException(status_code=403, detail="Access denied to project")

    role_permissions = {
        "admin": {"admin", "annotator", "reviewer", "viewer"},
        "annotator": {"annotator", "viewer"},
        "reviewer": {"reviewer", "viewer"},
        "viewer": {"viewer"},
    }
    if required_role not in role_permissions.get(effective_role, set()):
        raise HTTPException(status_code=403, detail="Insufficient project permissions")

    return workspace


def _project_to_response(project: dict) -> ProjectResponse:
    """Convert MongoDB project document to ProjectResponse."""
    return ProjectResponse(
        id=str(project["_id"]),
        workspace_id=str(project["workspace_id"]),
        name=project["name"],
        type=project["type"],
        description=project.get("description", ""),
        image_count=project.get("image_count", 0),
        annotation_count=project.get("annotation_count", 0),
        member_count=len(project.get("members", [])),
        created_at=project.get("created_at"),
        updated_at=project.get("updated_at"),
    )


def _cvat_project_url(project_id: str) -> str:
    return f"{settings.CVAT_URL.rstrip('/')}/projects/{project_id}"


def _cvat_task_url(task_id: str) -> str:
    return f"{settings.CVAT_URL.rstrip('/')}/tasks/{task_id}"


@router.get("/invitations/my", response_model=List[ProjectInvitationResponse])
async def get_my_project_invitations(
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Get all pending project invitations for the current user.
    """
    cursor = db.project_invitations.find({
        "invitee_email": current_user.email,
        "status": "pending"
    }).sort("created_at", -1)
    
    invitations = []
    async for doc in cursor:
        doc["id"] = str(doc["_id"])
        invitations.append(ProjectInvitationResponse(**doc))
        
    return invitations


@router.get("")
async def list_projects(
    workspace_id: str = Query(...),
    user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> List[dict]:
    """
    Get all projects in a workspace. Cached for 60 seconds.
    """
    workspace = await db.workspaces.find_one({"_id": ObjectId(workspace_id)})
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")

    user_id = str(user.id)
    workspace_member = next(
        (m for m in workspace.get("members", []) if m["user_id"] == user_id),
        None,
    )
    if workspace_member:
        projects = await db.projects.find({"workspace_id": workspace_id}).to_list(None)
    else:
        projects = await db.projects.find({
            "workspace_id": workspace_id,
            "members.user_id": user_id,
        }).to_list(None)
        if not projects:
            raise HTTPException(status_code=403, detail="Access denied to workspace")

    repaired_projects = []
    for p in projects:
        if p.get("image_count", 0) == 0 and p.get("annotation_count", 0) > 0:
            await db.annotations.delete_many({"project_id": str(p["_id"])})
            await db.projects.update_one(
                {"_id": p["_id"]},
                {"$set": {"annotation_count": 0}}
            )
            await db.class_labels.update_many(
                {"project_id": str(p["_id"])},
                {"$set": {"annotation_count": 0}}
            )
            p["annotation_count"] = 0
        repaired_projects.append(p)

    return [_project_to_response(p).model_dump() for p in repaired_projects]


@router.post("", status_code=201)
async def create_project(
    workspace_id: str = Query(...),
    payload: ProjectCreate = None,
    user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """
    Create a new project.
    """
    await check_workspace_access(user, workspace_id, db, "admin")
    now = datetime.utcnow()
    project_doc = {
        "workspace_id": workspace_id,
        "name": payload.name,
        "type": payload.type,
        "description": payload.description or "",
        "image_count": 0,
        "annotation_count": 0,
        "created_at": now,
        "updated_at": now,
    }
    result = await db.projects.insert_one(project_doc)
    class_names = []
    seen_names = set()
    for raw_name in payload.initial_class_labels or []:
        name = raw_name.strip()
        key = name.lower()
        if name and key not in seen_names:
            seen_names.add(key)
            class_names.append(name)

    if class_names:
        await db.class_labels.insert_many([
            {
                "project_id": str(result.inserted_id),
                "name": name,
                "color": DEFAULT_CLASS_COLORS[index % len(DEFAULT_CLASS_COLORS)],
                "annotation_count": 0,
                "created_at": now,
            }
            for index, name in enumerate(class_names)
        ])

    # No easy way to invalidate by prefix in our simple helper yet, 
    # but we can improve the helper or just wait for TTL.
    return _project_to_response({**project_doc, "_id": result.inserted_id})


@router.get("/{project_id}")
async def get_project(
    project_id: str,
    user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    """
    Get detailed project info.
    """
    try:
        project_oid = ObjectId(project_id)
    except:
        raise HTTPException(status_code=400, detail="Invalid project ID")
    
    project = await db.projects.find_one({"_id": project_oid})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    await check_project_access(user, project, db, "viewer")
    
    if project.get("image_count", 0) == 0 and project.get("annotation_count", 0) > 0:
        await db.annotations.delete_many({"project_id": project_id})
        await db.projects.update_one(
            {"_id": project_oid},
            {"$set": {"annotation_count": 0}}
        )
        await db.class_labels.update_many(
            {"project_id": project_id},
            {"$set": {"annotation_count": 0}}
        )
        project["annotation_count"] = 0
    
    class_labels = await db.class_labels.find({"project_id": project_id}).to_list(None)
    recent_images = await db.images.find({"project_id": project_id}).sort("created_at", -1).limit(5).to_list(None)
    recent_images_response = []
    for img in recent_images:
        img_id = str(img.pop("_id"))
        img_url = storage_client.generate_presigned_url(img["filename"]) if img.get("filename") else img.get("url", "")
        if "url" in img:
            del img["url"]
        recent_images_response.append(ImageResponse(id=img_id, url=img_url, **img).model_dump())
    
    # Get workspace to find owner/admins
    workspace = await db.workspaces.find_one({"_id": ObjectId(project["workspace_id"])})
    workspace_members = workspace.get("members", [])
    
    # Get member details
    members_data = []
    
    # IDs from workspace admins/owners
    ws_admins_ids = [m["user_id"] for m in workspace_members if m["role"] in ["owner", "admin"]]
    # IDs from project members
    project_member_ids = [m["user_id"] for m in project.get("members", [])]
    
    # Unique set of all people who should be shown as project members
    all_member_ids = list(set(ws_admins_ids + project_member_ids))
    
    for uid in all_member_ids:
        try:
            user_doc = await db.users.find_one({"_id": ObjectId(uid)})
            if user_doc:
                p_member = next((m for m in project.get("members", []) if m["user_id"] == uid), None)
                ws_member = next((m for m in workspace_members if m["user_id"] == uid), None)
                
                # Role priority: Project role if explicitly assigned, else Workspace role
                role = "member"
                if p_member:
                    role = p_member["role"]
                elif ws_member:
                    role = ws_member["role"]
                
                members_data.append({
                    "user_id": uid,
                    "email": user_doc["email"],
                    "full_name": user_doc["full_name"],
                    "role": role,
                    "joined_at": p_member.get("joined_at", project["created_at"]) if p_member else project["created_at"]
                })
        except:
            continue

    return {
        **_project_to_response(project).model_dump(),
        "members": members_data,
        "member_count": len(members_data),
        "class_labels": [ClassLabelResponse(id=str(cl["_id"]), **cl).model_dump() for cl in class_labels],
        "recent_images": recent_images_response
    }


@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: str,
    payload: ProjectUpdate,
    user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> ProjectResponse:
    """
    Update project metadata.
    Requires workspace owner/admin or project admin.
    """
    try:
        project_oid = ObjectId(project_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid project ID")

    project = await db.projects.find_one({"_id": project_oid})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    await check_project_access(user, project, db, "admin")

    update_data = payload.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    update_data["updated_at"] = datetime.utcnow()
    await db.projects.update_one(
        {"_id": project_oid},
        {"$set": update_data},
    )

    updated_project = await db.projects.find_one({"_id": project_oid})
    return _project_to_response(updated_project)


@router.post("/{project_id}/cvat/open")
async def open_project_in_cvat(
    project_id: str,
    user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    try:
        project_oid = ObjectId(project_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid project ID")

    project = await db.projects.find_one({"_id": project_oid})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    await check_project_access(user, project, db, "annotator")

    if not settings.CVAT_URL:
        raise HTTPException(
            status_code=501,
            detail="CVAT is not configured. Set CVAT_URL in backend environment first.",
        )

    integration = await db.cvat_integrations.find_one({"project_id": project_id})
    if not integration:
        integration = {
            "project_id": project_id,
            "cvat_project_id": None,
            "cvat_task_id": None,
            "status": "pending_setup",
            "created_by_user_id": str(user.id),
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        }
        await db.cvat_integrations.insert_one(integration)

    cvat_task_id = integration.get("cvat_task_id")
    cvat_project_id = integration.get("cvat_project_id")
    if cvat_task_id:
        url = _cvat_task_url(str(cvat_task_id))
    elif cvat_project_id:
        url = _cvat_project_url(str(cvat_project_id))
    else:
        url = settings.CVAT_URL.rstrip("/")

    return {
        "url": url,
        "status": integration.get("status", "pending_setup"),
        "message": "CVAT integration record is ready.",
    }


@router.post("/{project_id}/cvat/sync")
async def sync_project_from_cvat(
    project_id: str,
    user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    try:
        project_oid = ObjectId(project_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid project ID")

    project = await db.projects.find_one({"_id": project_oid})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    await check_project_access(user, project, db, "admin")

    if not settings.CVAT_URL:
        raise HTTPException(
            status_code=501,
            detail="CVAT is not configured. Set CVAT_URL in backend environment first.",
        )

    integration = await db.cvat_integrations.find_one({"project_id": project_id})
    if not integration or not integration.get("cvat_task_id"):
        raise HTTPException(
            status_code=409,
            detail="No CVAT task is linked to this project yet.",
        )

    await db.cvat_integrations.update_one(
        {"project_id": project_id},
        {"$set": {"last_sync_requested_at": datetime.utcnow(), "updated_at": datetime.utcnow()}},
    )

    return {
        "status": "queued",
        "message": "CVAT annotation sync placeholder was triggered.",
    }


@router.get("/{project_id}/stats")
@cache_response(ttl=300, key_prefix="project_stats")
async def get_project_stats(
    project_id: str,
    user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    """
    Get project statistics. Cached for 5 minutes.
    """
    project = await db.projects.find_one({"_id": ObjectId(project_id)})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    await check_project_access(user, project, db, "viewer")

    total_images = await db.images.count_documents({"project_id": project_id})
    annotated = await db.images.count_documents({
        "project_id": project_id,
        "$or": [
            {"annotation_status": "annotated"},
            {
                "annotation_status": {"$exists": False},
                "status": {"$in": ["annotated", "needs_review", "approved", "rejected"]},
            },
        ],
    })
    
    splits = ["train", "valid", "test"]
    split_counts = {s: await db.images.count_documents({"project_id": project_id, "split": s}) for s in splits}

    class_dist = await db.annotations.aggregate([
        {"$match": {"project_id": project_id}},
        {"$group": {"_id": "$class_name", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}
    ]).to_list(None)

    return {
        "total_images": total_images,
        "annotated": annotated,
        "unannotated": total_images - annotated,
        **{f"{s}_count": count for s, count in split_counts.items()},
        "class_distribution": [{"name": i["_id"], "count": i["count"]} for i in class_dist]
    }


@router.post("/{project_id}/classes", status_code=201)
async def create_class_label(
    project_id: str,
    payload: ClassLabelCreate,
    user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> ClassLabelResponse:
    project = await db.projects.find_one({"_id": ObjectId(project_id)})
    await check_project_access(user, project, db, "admin")
    
    doc = {
        "project_id": project_id,
        "name": payload.name,
        "color": payload.color,
        "annotation_count": 0,
        "created_at": datetime.utcnow()
    }
    result = await db.class_labels.insert_one(doc)
    return ClassLabelResponse(id=str(result.inserted_id), **doc)


@router.get("/{project_id}/classes")
async def list_class_labels(
    project_id: str,
    user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> List[ClassLabelResponse]:
    project = await db.projects.find_one({"_id": ObjectId(project_id)})
    await check_project_access(user, project, db, "viewer")
    
    classes = await db.class_labels.find({"project_id": project_id}).to_list(None)
    return [ClassLabelResponse(id=str(c["_id"]), **c) for c in classes]


@router.patch("/{project_id}/classes/{class_id}")
async def update_class_label(
    project_id: str,
    class_id: str,
    payload: ClassLabelUpdate,
    user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    project = await db.projects.find_one({"_id": ObjectId(project_id)})
    await check_project_access(user, project, db, "admin")
    
    update_data = payload.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
        
    await db.class_labels.update_one(
        {"_id": ObjectId(class_id), "project_id": project_id},
        {"$set": update_data}
    )
    
    if "name" in update_data:
        await db.annotations.update_many(
            {"project_id": project_id, "class_id": class_id},
            {"$set": {"class_name": update_data["name"]}}
        )
        
    return {"message": "Class label updated"}


@router.delete("/{project_id}/classes/{class_id}")
async def delete_class_label(
    project_id: str,
    class_id: str,
    user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    project = await db.projects.find_one({"_id": ObjectId(project_id)})
    await check_project_access(user, project, db, "admin")
    
    await db.class_labels.delete_one({"_id": ObjectId(class_id), "project_id": project_id})
    await db.annotations.delete_many({"project_id": project_id, "class_id": class_id})
    
    return {"message": "Class label and its annotations deleted"}


@router.post("/{project_id}/classes/merge")
async def merge_class_labels(
    project_id: str,
    payload: ClassLabelMerge,
    user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    project = await db.projects.find_one({"_id": ObjectId(project_id)})
    await check_project_access(user, project, db, "admin")
    
    target_class = await db.class_labels.find_one({"_id": ObjectId(payload.target_class_id)})
    if not target_class:
        raise HTTPException(status_code=404, detail="Target class not found")
        
    source_oids = [ObjectId(cid) for cid in payload.source_class_ids]
    
    await db.annotations.update_many(
        {"project_id": project_id, "class_id": {"$in": payload.source_class_ids}},
        {"$set": {"class_id": payload.target_class_id, "class_name": target_class["name"]}}
    )
    
    await db.class_labels.delete_many({"_id": {"$in": source_oids}, "project_id": project_id})
    
    return {"message": "Class labels merged successfully"}



@router.delete("/{project_id}", status_code=204)
async def delete_project(
    project_id: str,
    background_tasks: BackgroundTasks,
    user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """
    Delete a project and all project-scoped data.
    Requires workspace owner/admin or project admin.
    """
    try:
        project_oid = ObjectId(project_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid project ID")

    project = await db.projects.find_one({"_id": project_oid})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    await check_project_access(user, project, db, "admin")

    images = await db.images.find({"project_id": project_id}).to_list(None)
    for image in images:
        filename = image.get("filename")
        if filename:
            background_tasks.add_task(storage_client.delete_file, filename)

    await db.projects.delete_one({"_id": project_oid})
    await db.images.delete_many({"project_id": project_id})
    await db.annotations.delete_many({"project_id": project_id})
    await db.class_labels.delete_many({"project_id": project_id})
    await db.dataset_versions.delete_many({"project_id": project_id})
    await db.training_jobs.delete_many({"project_id": project_id})
    await db.deployed_models.delete_many({"project_id": project_id})
    await db.project_invitations.update_many(
        {"project_id": project_id, "status": "pending"},
        {"$set": {"status": "cancelled", "responded_at": datetime.utcnow()}},
    )

    return None


@router.delete("/{project_id}/members/{user_id}", status_code=204)
async def remove_project_member(
    project_id: str,
    user_id: str,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Remove a member from a project.
    """
    try:
        project_oid = ObjectId(project_id)
    except:
        raise HTTPException(status_code=400, detail="Invalid project ID")
        
    project = await db.projects.find_one({"_id": project_oid})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    workspace_id = project["workspace_id"]
    workspace = await db.workspaces.find_one({"_id": ObjectId(workspace_id)})
    
    # Check permissions: workspace owner/admin or project admin
    current_user_id = str(current_user.id)
    ws_role = next((m["role"] for m in workspace.get("members", []) if m["user_id"] == current_user_id), None)
    project_role = next((m["role"] for m in project.get("members", []) if m["user_id"] == current_user_id), None)
    
    if ws_role not in ["owner", "admin"] and project_role != "admin":
        # Allow removing self
        if user_id != current_user_id:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        
    await db.projects.update_one({"_id": project_oid}, {"$pull": {"members": {"user_id": user_id}}})
    await db.images.update_many(
        {"project_id": project_id, "assigned_to_user_id": user_id},
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
    return None

@router.patch("/{project_id}/members/{user_id}", status_code=204)
async def update_project_member_role(
    project_id: str,
    user_id: str,
    payload: ProjectMemberUpdate,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Update a member's role in a project.
    """
    try:
        project_oid = ObjectId(project_id)
    except:
        raise HTTPException(status_code=400, detail="Invalid project ID")
        
    project = await db.projects.find_one({"_id": project_oid})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    workspace_id = project["workspace_id"]
    workspace = await db.workspaces.find_one({"_id": ObjectId(workspace_id)})
    
    # Check permissions: workspace owner/admin or project admin
    current_user_id = str(current_user.id)
    ws_role = next((m["role"] for m in workspace.get("members", []) if m["user_id"] == current_user_id), None)
    project_role = next((m["role"] for m in project.get("members", []) if m["user_id"] == current_user_id), None)
    
    if ws_role not in ["owner", "admin"] and project_role != "admin":
        raise HTTPException(status_code=403, detail="Insufficient permissions")
        
    # Check if target user is actually in the project members list
    member_exists = any(m["user_id"] == user_id for m in project.get("members", []))
    if not member_exists:
        raise HTTPException(status_code=404, detail="Member not found in project")

    await db.projects.update_one(
        {"_id": project_oid, "members.user_id": user_id},
        {"$set": {"members.$.role": payload.role}}
    )
    return None
