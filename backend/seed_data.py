#!/usr/bin/env python3
"""
Seed comprehensive local test data for Label Forge / VisionFlow.

Run from repo root:
    python backend/seed_data.py

Run from backend folder:
    python seed_data.py
"""

import asyncio
import io
import os
import secrets
import sys
from datetime import datetime, timedelta

from bson import ObjectId
from PIL import Image as PILImage, ImageDraw, ImageFont


if os.path.exists("backend"):
    sys.path.insert(0, "backend")


# Local development defaults. Existing shell env values are preserved.
os.environ.setdefault("MONGO_URI", "mongodb://localhost:27018")
os.environ.setdefault("MONGO_DB_NAME", "visionflow")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379")
os.environ.setdefault("MINIO_ENDPOINT", "localhost:9000")
os.environ.setdefault("MINIO_PUBLIC_ENDPOINT", "http://localhost:9000")
os.environ.setdefault("MINIO_ACCESS_KEY", "minioadmin")
os.environ.setdefault("MINIO_SECRET_KEY", "minioadmin")
os.environ.setdefault("MINIO_BUCKET_NAME", "labelforge")
os.environ.setdefault("JWT_SECRET", "your-super-secret-jwt-key-change-in-production")
os.environ.setdefault("JWT_ALGORITHM", "HS256")
os.environ.setdefault("ACCESS_TOKEN_EXPIRE_MINUTES", "10080")
os.environ.setdefault("SESSION_IDLE_TIMEOUT_MINUTES", "30")
os.environ.setdefault("COOKIE_SECURE", "false")


from app.core.database import close_db, connect_db, db_instance
from app.core.storage import storage_client
from app.models.annotation import AnnotationInDB
from app.models.class_label import ClassLabelInDB
from app.models.dataset_version import DatasetVersionInDB
from app.models.deployed_model import DeployedModelInDB
from app.models.image import ImageInDB
from app.models.notification import NotificationInDB
from app.models.project import ProjectInDB
from app.models.project_invitation import ProjectInvitationInDB
from app.models.training_job import TrainingJobInDB
from app.models.user import UserInDB
from app.models.workspace import WorkspaceInDB
from app.models.workspace_invitation import WorkspaceInvitationInDB
from app.utils.auth import hash_password


NOW = datetime.utcnow()


def oid() -> ObjectId:
    return ObjectId()


def token() -> str:
    return secrets.token_urlsafe(24)


def user_doc(_id: ObjectId, email: str, full_name: str, password: str) -> dict:
    doc = {
        "_id": _id,
        "email": email,
        "full_name": full_name,
        "hashed_password": hash_password(password),
        "created_at": NOW,
        "is_active": True,
    }
    UserInDB(**{**doc, "_id": str(_id)})
    return doc


def workspace_member(user_id: ObjectId, role: str) -> dict:
    return {"user_id": str(user_id), "role": role}


def project_member(user_id: ObjectId, role: str, days_ago: int = 7) -> dict:
    return {
        "user_id": str(user_id),
        "role": role,
        "joined_at": NOW - timedelta(days=days_ago),
    }


def split_for(index: int) -> str:
    return ["train", "train", "valid", "test", "unassigned"][index % 5]


def annotation_type_for(index: int) -> str:
    return ["bbox", "polygon", "classification"][index % 3]


def coordinates_for(annotation_type: str, index: int) -> dict:
    if annotation_type == "bbox":
        return {
            "x": 80 + index * 7,
            "y": 110 + index * 5,
            "width": 180 + index,
            "height": 140 + index,
        }
    if annotation_type == "polygon":
        offset = index * 3
        return {
            "points": [
                [90 + offset, 90],
                [250 + offset, 110],
                [230 + offset, 260],
                [100 + offset, 240],
            ]
        }
    return {}


def generate_mock_image_bytes(project_key: str, image_index: int) -> bytes:
    colors = {
        "traffic": (44, 62, 80),      # Dark Blue-Grey
        "fruit": (230, 126, 34),       # Soft Orange
        "road": (52, 73, 94),         # Wet Asphalt
        "people": (26, 188, 156),     # Turquoise
        "medical": (30, 30, 30),      # Dark Charcoal
    }
    bg_color = colors.get(project_key, (127, 127, 127))
    
    img = PILImage.new("RGB", (800, 600), color=bg_color)
    draw = ImageDraw.Draw(img)
    
    # Draw some mock shapes representing targets based on index
    if project_key == "traffic":
        # Draw a yellow rectangle (representing a vehicle)
        draw.rectangle([150, 200, 450, 450], fill=(241, 196, 15), outline=(230, 126, 34), width=5)
        # Draw a red rectangle (representing a truck)
        draw.rectangle([500, 100, 750, 480], fill=(231, 76, 60), outline=(192, 57, 43), width=5)
        # Draw a green circle (traffic light)
        draw.ellipse([50, 50, 100, 100], fill=(46, 204, 113))
    elif project_key == "fruit":
        # Draw fruits
        draw.ellipse([200, 200, 400, 400], fill=(231, 76, 60), outline=(192, 57, 43), width=5) # Apple
        draw.ellipse([450, 250, 600, 400], fill=(241, 196, 15), outline=(243, 156, 18), width=5) # Orange
    elif project_key == "road":
        # Draw lanes
        draw.polygon([(100, 600), (380, 200), (420, 200), (700, 600)], fill=(44, 62, 80))
        draw.line([(400, 200), (400, 600)], fill=(241, 196, 15), width=8)
    elif project_key == "people":
        # Draw stick figures/blobs
        draw.ellipse([200, 150, 300, 250], fill=(155, 89, 182))
        draw.rectangle([180, 250, 320, 500], fill=(142, 68, 173))
        draw.ellipse([500, 200, 580, 280], fill=(52, 152, 219))
        draw.rectangle([480, 280, 600, 500], fill=(41, 128, 185))
    elif project_key == "medical":
        # Grayscale blobs
        for i in range(3):
            x, y = 300 + i * 80, 250 + i * 40
            draw.ellipse([x - 50, y - 50, x + 50, y + 50], fill=(150 + i * 30, 150 + i * 30, 150 + i * 30))
            draw.ellipse([x - 20, y - 20, x + 20, y + 20], fill=(240, 240, 240))
            
    try:
        font = ImageFont.load_default()
        draw.text((20, 20), f"PROJECT: {project_key.upper()}", fill=(255, 255, 255), font=font)
        draw.text((20, 40), f"IMAGE: {image_index + 1:03d}", fill=(255, 255, 255), font=font)
        draw.text((20, 560), "LABEL FORGE LOCAL DEMO DATA", fill=(255, 255, 255), font=font)
    except:
        pass
        
    img_bytes = io.BytesIO()
    img.save(img_bytes, format="JPEG", quality=90)
    return img_bytes.getvalue()


async def seed_data() -> None:
    await connect_db()

    try:
        database = db_instance.db

        collections = [
            "users",
            "workspaces",
            "workspace_invitations",
            "projects",
            "project_invitations",
            "class_labels",
            "images",
            "annotations",
            "dataset_versions",
            "training_jobs",
            "deployed_models",
            "notifications",
        ]

        for collection in collections:
            await database[collection].delete_many({})
        print("SUCCESS: Cleared all seed collections")

        # ==================== MINIO BUCKET ====================
        try:
            storage_client.ensure_bucket()
            print(f"SUCCESS: Ensured MinIO bucket '{storage_client.bucket}' exists")
        except Exception as e:
            print(f"WARNING: Could not connect to MinIO / ensure bucket: {e}")

        # ==================== USERS ====================
        users = {
            "owner": oid(),
            "admin": oid(),
            "member": oid(),
            "viewer": oid(),
            "annotator": oid(),
            "reviewer": oid(),
            "project_viewer": oid(),
            "outside": oid(),
        }

        users_data = [
            user_doc(users["owner"], "owner@example.com", "Owner User", "owner12345"),
            user_doc(users["admin"], "admin@example.com", "Admin User", "admin12345"),
            user_doc(users["member"], "member@example.com", "Member User", "member12345"),
            user_doc(users["viewer"], "viewer@example.com", "Viewer User", "viewer12345"),
            user_doc(users["annotator"], "annotator@example.com", "Annotator User", "annotator12345"),
            user_doc(users["reviewer"], "reviewer@example.com", "Reviewer User", "reviewer12345"),
            user_doc(users["project_viewer"], "project.viewer@example.com", "Project Viewer", "viewer12345"),
            user_doc(users["outside"], "outside@example.com", "Outside User", "outside12345"),
        ]
        await database.users.insert_many(users_data)
        print(f"SUCCESS: Created {len(users_data)} users")

        # ==================== WORKSPACES ====================
        workspaces = {
            "main": oid(),
            "client": oid(),
            "read_only": oid(),
        }

        workspaces_data = [
            {
                "_id": workspaces["main"],
                "name": "Main Computer Vision Workspace",
                "owner_id": str(users["owner"]),
                "plan": "pro",
                "members": [
                    workspace_member(users["owner"], "owner"),
                    workspace_member(users["admin"], "admin"),
                    workspace_member(users["member"], "member"),
                    workspace_member(users["viewer"], "viewer"),
                ],
                "created_at": NOW - timedelta(days=90),
            },
            {
                "_id": workspaces["client"],
                "name": "Client Annotation Workspace",
                "owner_id": str(users["admin"]),
                "plan": "free",
                "members": [
                    workspace_member(users["admin"], "owner"),
                    workspace_member(users["annotator"], "member"),
                    workspace_member(users["reviewer"], "viewer"),
                ],
                "created_at": NOW - timedelta(days=45),
            },
            {
                "_id": workspaces["read_only"],
                "name": "Read Only Evaluation Workspace",
                "owner_id": str(users["reviewer"]),
                "plan": "free",
                "members": [
                    workspace_member(users["reviewer"], "owner"),
                    workspace_member(users["viewer"], "viewer"),
                ],
                "created_at": NOW - timedelta(days=20),
            },
        ]

        for doc in workspaces_data:
            WorkspaceInDB(**{**doc, "_id": str(doc["_id"])})
        await database.workspaces.insert_many(workspaces_data)
        print(f"SUCCESS: Created {len(workspaces_data)} workspaces")

        # ==================== PROJECTS ====================
        projects = {
            "traffic": oid(),
            "fruit": oid(),
            "road": oid(),
            "people": oid(),
            "medical": oid(),
        }

        projects_data = [
            {
                "_id": projects["traffic"],
                "workspace_id": str(workspaces["main"]),
                "name": "Traffic Object Detection",
                "type": "object-detection",
                "description": "Detect cars, buses, trucks, and bikes in traffic scenes.",
                "image_count": 0,
                "annotation_count": 0,
                "members": [
                    project_member(users["annotator"], "annotator"),
                    project_member(users["reviewer"], "reviewer"),
                    project_member(users["project_viewer"], "viewer"),
                ],
                "created_at": NOW - timedelta(days=30),
                "updated_at": NOW - timedelta(days=2),
            },
            {
                "_id": projects["fruit"],
                "workspace_id": str(workspaces["main"]),
                "name": "Fruit Classification",
                "type": "classification",
                "description": "Classify fruit images for sample classification workflows.",
                "image_count": 0,
                "annotation_count": 0,
                "members": [
                    project_member(users["member"], "annotator"),
                    project_member(users["viewer"], "viewer"),
                ],
                "created_at": NOW - timedelta(days=25),
                "updated_at": NOW - timedelta(days=3),
            },
            {
                "_id": projects["road"],
                "workspace_id": str(workspaces["client"]),
                "name": "Road Semantic Segmentation",
                "type": "semantic-segmentation",
                "description": "Segment roads, sidewalks, lane markings, and signs.",
                "image_count": 0,
                "annotation_count": 0,
                "members": [
                    project_member(users["annotator"], "annotator"),
                    project_member(users["reviewer"], "reviewer"),
                ],
                "created_at": NOW - timedelta(days=18),
                "updated_at": NOW - timedelta(days=1),
            },
            {
                "_id": projects["people"],
                "workspace_id": str(workspaces["client"]),
                "name": "People Instance Segmentation",
                "type": "instance-segmentation",
                "description": "Segment individual people in crowded scenes.",
                "image_count": 0,
                "annotation_count": 0,
                "members": [
                    project_member(users["annotator"], "annotator"),
                    project_member(users["project_viewer"], "viewer"),
                ],
                "created_at": NOW - timedelta(days=12),
                "updated_at": NOW - timedelta(hours=12),
            },
            {
                "_id": projects["medical"],
                "workspace_id": str(workspaces["read_only"]),
                "name": "Medical Tumor Detection",
                "type": "object-detection",
                "description": "Demo medical imaging dataset with read-only reviewers.",
                "image_count": 0,
                "annotation_count": 0,
                "members": [
                    project_member(users["admin"], "admin"),
                    project_member(users["reviewer"], "reviewer"),
                ],
                "created_at": NOW - timedelta(days=8),
                "updated_at": NOW - timedelta(hours=6),
            },
        ]

        for doc in projects_data:
            ProjectInDB(**{**doc, "_id": str(doc["_id"])})
        await database.projects.insert_many(projects_data)
        print(f"SUCCESS: Created {len(projects_data)} projects")

        # ==================== CLASS LABELS ====================
        label_specs = {
            "traffic": [
                ("Car", "#ef4444"),
                ("Bus", "#f59e0b"),
                ("Truck", "#3b82f6"),
                ("Motorbike", "#22c55e"),
            ],
            "fruit": [
                ("Apple", "#ef4444"),
                ("Banana", "#facc15"),
                ("Orange", "#fb923c"),
                ("Grape", "#8b5cf6"),
            ],
            "road": [
                ("Road", "#64748b"),
                ("Sidewalk", "#94a3b8"),
                ("Lane", "#f8fafc"),
                ("Sign", "#38bdf8"),
            ],
            "people": [
                ("Person", "#ec4899"),
                ("Bag", "#14b8a6"),
            ],
            "medical": [
                ("Tumor", "#dc2626"),
                ("Normal Tissue", "#16a34a"),
            ],
        }

        labels_by_project = {}
        class_labels_data = []
        for project_key, specs in label_specs.items():
            labels_by_project[project_key] = []
            for name, color in specs:
                label_id = oid()
                doc = {
                    "_id": label_id,
                    "project_id": str(projects[project_key]),
                    "name": name,
                    "color": color,
                    "annotation_count": 0,
                    "created_at": NOW - timedelta(days=10),
                }
                ClassLabelInDB(**{**doc, "_id": str(label_id)})
                labels_by_project[project_key].append(doc)
                class_labels_data.append(doc)

        await database.class_labels.insert_many(class_labels_data)
        print(f"SUCCESS: Created {len(class_labels_data)} class labels")

        # ==================== IMAGES + ANNOTATIONS ====================
        project_key_by_id = {str(value): key for key, value in projects.items()}
        images_data = []
        annotations_data = []
        image_counts = {str(project_id): 0 for project_id in projects.values()}
        annotation_counts = {str(project_id): 0 for project_id in projects.values()}
        label_annotation_counts = {str(label["_id"]): 0 for label in class_labels_data}

        for project_index, (project_key, project_id) in enumerate(projects.items()):
            for image_index in range(12):
                image_id = oid()
                is_annotated = image_index % 3 != 0
                filename = f"{project_key}_{image_index + 1:03d}.jpg"
                
                # Physical image generation and upload
                try:
                    img_bytes = generate_mock_image_bytes(project_key, image_index)
                    storage_client.upload_file(
                        file_bytes=img_bytes,
                        filename=filename,
                        content_type="image/jpeg"
                    )
                except Exception as ex:
                    print(f"WARNING: Could not upload physical image '{filename}' to MinIO: {ex}")
                
                image_doc = {
                    "_id": image_id,
                    "project_id": str(project_id),
                    "filename": filename,
                    "original_filename": f"{project_key.upper()}_{image_index + 1:03d}.jpg",
                    "url": f"http://localhost:9000/{storage_client.bucket}/{filename}",
                    "width": 1280 + (image_index % 3) * 320,
                    "height": 720 + (image_index % 2) * 180,
                    "split": split_for(image_index),
                    "status": "annotated" if is_annotated else "unannotated",
                    "created_at": NOW - timedelta(days=20 - image_index),
                }
                ImageInDB(**{**image_doc, "_id": str(image_id)})
                images_data.append(image_doc)
                image_counts[str(project_id)] += 1

                if is_annotated:
                    labels = labels_by_project[project_key]
                    annotation_total = 1 if project_key == "fruit" else 2
                    for ann_index in range(annotation_total):
                        label = labels[(image_index + ann_index) % len(labels)]
                        ann_type = "classification" if project_key == "fruit" else annotation_type_for(image_index + ann_index)
                        ann_doc = {
                            "_id": oid(),
                            "image_id": str(image_id),
                            "project_id": str(project_id),
                            "class_id": str(label["_id"]),
                            "class_name": label["name"],
                            "type": ann_type,
                            "coordinates": coordinates_for(ann_type, image_index + ann_index),
                            "created_at": NOW - timedelta(days=5, hours=ann_index),
                        }
                        AnnotationInDB(**{**ann_doc, "_id": str(ann_doc["_id"])})
                        annotations_data.append(ann_doc)
                        annotation_counts[str(project_id)] += 1
                        label_annotation_counts[str(label["_id"])] += 1

        await database.images.insert_many(images_data)
        await database.annotations.insert_many(annotations_data)

        for project_id, count in image_counts.items():
            await database.projects.update_one(
                {"_id": ObjectId(project_id)},
                {"$set": {"image_count": count, "annotation_count": annotation_counts[project_id]}},
            )

        for label_id, count in label_annotation_counts.items():
            await database.class_labels.update_one(
                {"_id": ObjectId(label_id)},
                {"$set": {"annotation_count": count}},
            )

        print(f"SUCCESS: Created {len(images_data)} images")
        print(f"SUCCESS: Created {len(annotations_data)} annotations")

        # ==================== DATASET VERSIONS ====================
        dataset_versions_data = []
        versions_by_project = {}
        for project_key, project_id in projects.items():
            project_id_str = str(project_id)
            version_id = oid()
            splits = {
                split: sum(
                    1 for image in images_data
                    if image["project_id"] == project_id_str and image["split"] == split
                )
                for split in ["train", "valid", "test"]
            }
            doc = {
                "_id": version_id,
                "project_id": project_id_str,
                "version_number": 1,
                "preprocessing": {
                    "resize": 640 if project_key in ["traffic", "road", "people"] else None,
                    "grayscale": project_key == "medical",
                    "auto_orient": True,
                },
                "augmentation": {
                    "flip_horizontal": True,
                    "flip_vertical": False,
                    "rotation": 10 if project_key != "medical" else 0,
                    "brightness": 0.15,
                    "blur": 0.05,
                    "noise": 0.02,
                },
                "train_count": splits["train"],
                "valid_count": splits["valid"],
                "test_count": splits["test"],
                "status": "ready",
                "created_at": NOW - timedelta(days=4),
            }
            DatasetVersionInDB(**{**doc, "_id": str(version_id)})
            dataset_versions_data.append(doc)
            versions_by_project[project_key] = version_id

        await database.dataset_versions.insert_many(dataset_versions_data)
        print(f"SUCCESS: Created {len(dataset_versions_data)} dataset versions")

        # ==================== TRAINING JOBS ====================
        job_specs = {
            "traffic": ("done", 0.86, 0.88, 0.83, 100, 100),
            "fruit": ("done", 0.94, 0.95, 0.92, 80, 80),
            "road": ("training", None, None, None, 100, 46),
            "people": ("queued", None, None, None, 60, 0),
            "medical": ("failed", None, None, None, 120, 12),
        }
        training_jobs_data = []
        jobs_by_project = {}

        for project_key, (status, map_score, precision, recall, total_epochs, epochs_completed) in job_specs.items():
            job_id = oid()
            started_at = NOW - timedelta(days=2) if status in ["done", "training", "failed"] else None
            finished_at = NOW - timedelta(days=1) if status in ["done", "failed"] else None
            doc = {
                "_id": job_id,
                "project_id": str(projects[project_key]),
                "dataset_version_id": str(versions_by_project[project_key]),
                "status": status,
                "map_score": map_score,
                "precision": precision,
                "recall": recall,
                "epochs_completed": epochs_completed,
                "total_epochs": total_epochs,
                "started_at": started_at,
                "finished_at": finished_at,
                "error_message": "GPU out of memory" if status == "failed" else None,
                "created_at": NOW - timedelta(days=3),
            }
            TrainingJobInDB(**{**doc, "_id": str(job_id)})
            training_jobs_data.append(doc)
            jobs_by_project[project_key] = job_id

        await database.training_jobs.insert_many(training_jobs_data)
        print(f"SUCCESS: Created {len(training_jobs_data)} training jobs")

        # ==================== DEPLOYED MODELS ====================
        deployed_models_data = []
        for project_key in ["traffic", "fruit"]:
            model_id = oid()
            doc = {
                "_id": model_id,
                "project_id": str(projects[project_key]),
                "training_job_id": str(jobs_by_project[project_key]),
                "api_key": f"lf_{secrets.token_urlsafe(18)}",
                "api_endpoint": f"/api/deploy/{model_id}/predict",
                "status": "active",
                "created_at": NOW - timedelta(hours=18),
            }
            DeployedModelInDB(**{**doc, "_id": str(model_id)})
            deployed_models_data.append(doc)

        await database.deployed_models.insert_many(deployed_models_data)
        print(f"SUCCESS: Created {len(deployed_models_data)} deployed models")

        # ==================== INVITATIONS + NOTIFICATIONS ====================
        workspace_invitation_id = oid()
        project_invitation_id = oid()

        workspace_invitation = {
            "_id": workspace_invitation_id,
            "workspace_id": str(workspaces["main"]),
            "workspace_name": "Main Computer Vision Workspace",
            "invited_by_user_id": str(users["owner"]),
            "invited_by_name": "Owner User",
            "invited_by_avatar": None,
            "invitee_email": "outside@example.com",
            "invitee_user_id": str(users["outside"]),
            "role": "viewer",
            "status": "pending",
            "token": token(),
            "message": "Join this workspace as a viewer.",
            "created_at": NOW - timedelta(hours=4),
            "expires_at": NOW + timedelta(days=7),
            "responded_at": None,
        }
        project_invitation = {
            "_id": project_invitation_id,
            "project_id": str(projects["traffic"]),
            "project_name": "Traffic Object Detection",
            "workspace_id": str(workspaces["main"]),
            "invited_by_user_id": str(users["admin"]),
            "invited_by_name": "Admin User",
            "invited_by_avatar": None,
            "invitee_email": "outside@example.com",
            "invitee_user_id": str(users["outside"]),
            "role": "reviewer",
            "status": "pending",
            "token": token(),
            "message": "Please review this project health and training outputs.",
            "created_at": NOW - timedelta(hours=2),
            "expires_at": NOW + timedelta(days=7),
            "responded_at": None,
        }

        WorkspaceInvitationInDB(**{**workspace_invitation, "_id": str(workspace_invitation_id)})
        ProjectInvitationInDB(**{**project_invitation, "_id": str(project_invitation_id)})
        await database.workspace_invitations.insert_one(workspace_invitation)
        await database.project_invitations.insert_one(project_invitation)

        notifications_data = [
            {
                "_id": oid(),
                "user_id": str(users["outside"]),
                "type": "workspace_invitation_received",
                "title": "Workspace invitation",
                "body": "Owner User invited you to Main Computer Vision Workspace.",
                "entity_type": "workspace",
                "entity_id": str(workspaces["main"]),
                "entity_name": "Main Computer Vision Workspace",
                "invitation_id": str(workspace_invitation_id),
                "token": workspace_invitation["token"],
                "actor_name": "Owner User",
                "actor_avatar": None,
                "is_read": False,
                "action_required": True,
                "action_taken": False,
                "created_at": workspace_invitation["created_at"],
            },
            {
                "_id": oid(),
                "user_id": str(users["outside"]),
                "type": "project_invitation_received",
                "title": "Project invitation",
                "body": "Admin User invited you to Traffic Object Detection.",
                "entity_type": "project",
                "entity_id": str(projects["traffic"]),
                "entity_name": "Traffic Object Detection",
                "invitation_id": str(project_invitation_id),
                "token": project_invitation["token"],
                "actor_name": "Admin User",
                "actor_avatar": None,
                "is_read": False,
                "action_required": True,
                "action_taken": False,
                "created_at": project_invitation["created_at"],
            },
        ]

        for doc in notifications_data:
            NotificationInDB(**{**doc, "_id": str(doc["_id"])})
        await database.notifications.insert_many(notifications_data)
        print("SUCCESS: Created 2 invitations and 2 notifications")

        # ==================== INDEXES ====================
        await database.users.create_index("email", unique=True)
        await database.workspaces.create_index("members.user_id")
        await database.projects.create_index("workspace_id")
        await database.images.create_index("project_id")
        await database.annotations.create_index("image_id")
        await database.annotations.create_index("project_id")
        await database.dataset_versions.create_index("project_id")
        await database.training_jobs.create_index("project_id")
        await database.deployed_models.create_index("project_id")
        await database.workspace_invitations.create_index("token", unique=True)
        await database.project_invitations.create_index("token", unique=True)
        await database.notifications.create_index("user_id")

        print("SUCCESS: Ensured indexes")

        # ==================== SUMMARY ====================
        print("\n" + "=" * 72)
        print("TEST CREDENTIALS")
        print("=" * 72)
        credentials = [
            ("owner@example.com", "owner12345", "Workspace owner, project admin by workspace role"),
            ("admin@example.com", "admin12345", "Workspace admin and explicit medical project admin"),
            ("member@example.com", "member12345", "Workspace member and fruit project annotator"),
            ("viewer@example.com", "viewer12345", "Workspace/project viewer"),
            ("annotator@example.com", "annotator12345", "Project annotator"),
            ("reviewer@example.com", "reviewer12345", "Project reviewer"),
            ("project.viewer@example.com", "viewer12345", "Project-only viewer"),
            ("outside@example.com", "outside12345", "Pending invitation recipient"),
        ]
        for email, password, description in credentials:
            print(f"{email:<28} {password:<14} {description}")

        print("\n" + "=" * 72)
        print("RBAC SCENARIOS")
        print("=" * 72)
        print("owner/admin: can manage projects, labels, training, deploy, members")
        print("annotator: can upload images, split images, and create/update annotations")
        print("reviewer: can view versions, health, training, exports, and test models")
        print("viewer: can view project data only")
        print("project.viewer@example.com is not a workspace member but can view assigned projects")
        print("outside@example.com has pending workspace and project invitations")

        print("\n" + "=" * 72)
        print("DATA SUMMARY")
        print("=" * 72)
        print(f"Users: {len(users_data)}")
        print(f"Workspaces: {len(workspaces_data)}")
        print(f"Projects: {len(projects_data)}")
        print(f"Class labels: {len(class_labels_data)}")
        print(f"Images: {len(images_data)}")
        print(f"Annotations: {len(annotations_data)}")
        print(f"Dataset versions: {len(dataset_versions_data)}")
        print(f"Training jobs: {len(training_jobs_data)}")
        print(f"Deployed models: {len(deployed_models_data)}")
        print("Workspace invitations: 1")
        print("Project invitations: 1")
        print("Notifications: 2")

        print("\n" + "=" * 72)
        print("SUCCESS: Seed data created successfully")
        print("=" * 72)
        print(f"MongoDB URI: {os.environ['MONGO_URI']}")
        print(f"Database: {os.environ['MONGO_DB_NAME']}")
        print("Frontend: http://localhost:3000")
        print("Backend API: http://localhost:8888")
        print(f"Workspace invite token: {workspace_invitation['token']}")
        print(f"Project invite token: {project_invitation['token']}")

    finally:
        await close_db()


if __name__ == "__main__":
    asyncio.run(seed_data())
