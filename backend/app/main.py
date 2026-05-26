from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.gzip import GZipMiddleware
from app.core.config import settings
from app.core.database import connect_db, close_db, db_instance, get_database
from app.core.redis import connect_redis, redis_instance
from app.core.storage import storage_client
from app.routers import (
    auth, workspaces, projects, images, annotations, assignments,
    versions, health, training, deploy, settings as settings_router,
    workspace_invitations, project_invitations, notifications, invitations
)
from app.middleware.rate_limit import RateLimitMiddleware
from app.exceptions import register_exception_handlers
from app.services.training_worker import shutdown_training_executor, start_training_worker
from contextlib import asynccontextmanager
import asyncio
import logging
from datetime import datetime

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await connect_db()
    await connect_redis()
    storage_client.ensure_bucket()
    
    # 1. Create Indexes
    db = db_instance.db
    await db.workspace_invitations.create_index("token", unique=True)
    await db.workspace_invitations.create_index([("invitee_email", 1), ("workspace_id", 1), ("status", 1)])
    await db.project_invitations.create_index("token", unique=True)
    await db.project_invitations.create_index([("invitee_email", 1), ("project_id", 1), ("status", 1)])
    await db.notifications.create_index([("user_id", 1), ("is_read", 1)])
    await db.notifications.create_index([("user_id", 1), ("created_at", -1)])
    await db.images.create_index([("project_id", 1), ("assigned_to_user_id", 1), ("assignment_status", 1)])
    await db.images.create_index([("project_id", 1), ("status", 1), ("created_at", -1)])
    await db.annotations.create_index([("project_id", 1), ("created_by_user_id", 1)])
    await db.annotations.create_index([("project_id", 1), ("class_id", 1)])
    await db.annotation_audit_logs.create_index([("image_id", 1), ("created_at", -1)])
    await db.annotation_audit_logs.create_index([("project_id", 1), ("created_at", -1)])
    logger.info("MongoDB indexes created")

    # 2. Cleanup expired invitations task
    async def cleanup_invitations():
        while True:
            try:
                now = datetime.utcnow()
                await db.workspace_invitations.update_many(
                    {"status": "pending", "expires_at": {"$lt": now}},
                    {"$set": {"status": "expired"}}
                )
                await db.project_invitations.update_many(
                    {"status": "pending", "expires_at": {"$lt": now}},
                    {"$set": {"status": "expired"}}
                )
            except Exception as e:
                logger.error(f"Error cleaning up invitations: {e}")
            await asyncio.sleep(3600) # Every hour

    cleanup_task = asyncio.create_task(cleanup_invitations())
    
    # Start training worker task
    worker_task = asyncio.create_task(
        start_training_worker(db_instance.db, redis_instance.client)
    )
    logger.info("Training worker task started")
    
    yield
    
    # Shutdown
    worker_task.cancel()
    cleanup_task.cancel()
    shutdown_training_executor()
    await close_db()

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    lifespan=lifespan
)

# GZip compression for responses >= 1KB
app.add_middleware(GZipMiddleware, minimum_size=1024)

# Register custom exception handlers
register_exception_handlers(app)

# Rate limiting middleware (before other middleware)
app.add_middleware(RateLimitMiddleware)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers with /api prefix
app.include_router(auth.router, prefix="/api")
app.include_router(workspaces.router, prefix="/api")
app.include_router(workspace_invitations.router, prefix="/api")
app.include_router(projects.router, prefix="/api")
app.include_router(project_invitations.router, prefix="/api")
app.include_router(notifications.router, prefix="/api")
app.include_router(invitations.router, prefix="/api")
app.include_router(images.router, prefix="/api")
app.include_router(annotations.router, prefix="/api")
app.include_router(assignments.router, prefix="/api")
app.include_router(versions.router, prefix="/api")
app.include_router(health.router, prefix="/api")
app.include_router(training.router, prefix="/api")
app.include_router(deploy.router, prefix="/api")
app.include_router(settings_router.router, prefix="/api")

@app.get("/health")
async def health_check():
    db = get_database()
    mongo_ok = False
    try:
        await db.command("ping")
        mongo_ok = True
    except Exception as exc:
        logger.debug("MongoDB health check failed: %s", exc)
        
    return {
        "status": "ok",
        "mongo": mongo_ok,
        "redis": True,  # Simplified for now
        "version": settings.VERSION
    }

# Include routers (placeholders for now)
# app.include_router(auth.router, prefix="/auth", tags=["Authentication"])
# app.include_router(workspaces.router, prefix="/workspaces", tags=["Workspaces"])
# app.include_router(projects.router, prefix="/projects", tags=["Projects"])
# app.include_router(images.router, prefix="/images", tags=["Images"])
# app.include_router(annotations.router, prefix="/annotations", tags=["Annotations"])
# app.include_router(versions.router, prefix="/versions", tags=["Versions"])
# app.include_router(training.router, prefix="/training", tags=["Training"])
