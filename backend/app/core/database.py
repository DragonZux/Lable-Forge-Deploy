from motor.motor_asyncio import AsyncIOMotorClient
from app.core.config import settings

class Database:
    client: AsyncIOMotorClient = None
    db = None

db_instance = Database()

async def connect_db():
    db_instance.client = AsyncIOMotorClient(settings.MONGO_URI)
    db_instance.db = db_instance.client[settings.MONGO_DB_NAME]
    
    # Setup indexes
    await db_instance.db.users.create_index("email", unique=True)
    await db_instance.db.images.create_index("project_id")
    await db_instance.db.images.create_index([("project_id", 1), ("assigned_to_user_id", 1), ("assignment_status", 1)])
    await db_instance.db.annotations.create_index("image_id")
    await db_instance.db.annotations.create_index([("project_id", 1), ("created_by_user_id", 1)])
    await db_instance.db.projects.create_index("workspace_id")
    await db_instance.db.training_jobs.create_index("project_id")
    await db_instance.db.deployed_models.create_index("project_id")

async def close_db():
    if db_instance.client:
        db_instance.client.close()

def get_database():
    from fastapi import HTTPException, status

    if db_instance.db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database not connected",
        )

    return db_instance.db
