import asyncio
import json
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, Query, HTTPException, Request
from fastapi.responses import StreamingResponse
from app.core.database import get_database
from app.core.redis import redis_instance, cache_get, cache_set, cache_delete
from app.models.user import UserInDB
from app.models.notification import NotificationListResponse
from app.utils.auth import get_current_user
from app.services.notification_service import NotificationService
from motor.motor_asyncio import AsyncIOMotorDatabase

router = APIRouter(prefix="/notifications", tags=["Notifications"])

@router.get("", response_model=NotificationListResponse)
async def get_notifications(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    unread_only: bool = Query(False),
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: UserInDB = Depends(get_current_user)
):
    return await NotificationService.get_user_notifications(
        db, str(current_user.id), page, limit, unread_only
    )

@router.get("/unread-count")
async def get_unread_count(
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: UserInDB = Depends(get_current_user)
):
    cache_key = f"notif_count:{current_user.id}"
    cached_count = await cache_get(cache_key)
    
    if cached_count is not None:
        return {"count": cached_count}
    
    count = await db.notifications.count_documents({
        "user_id": str(current_user.id), 
        "is_read": False
    })
    
    await cache_set(cache_key, count, ttl=30)
    return {"count": count}

@router.post("/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: UserInDB = Depends(get_current_user)
):
    try:
        success = await NotificationService.mark_as_read(db, notification_id, str(current_user.id))
        if not success:
            raise HTTPException(status_code=404, detail="Notification not found")
        
        await cache_delete(f"notif_count:{current_user.id}")
        return {"message": "Notification marked as read"}
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=400, detail=f"Invalid notification ID or error: {str(e)}")

@router.post("/read-all")
async def mark_all_notifications_read(
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: UserInDB = Depends(get_current_user)
):
    count = await NotificationService.mark_all_as_read(db, str(current_user.id))
    await cache_delete(f"notif_count:{current_user.id}")
    return {"message": f"Marked {count} notifications as read"}

@router.get("/stream")
async def notification_stream(
    request: Request,
    current_user: UserInDB = Depends(get_current_user)
):
    user_id = str(current_user.id)
    
    async def event_generator():
        if not redis_instance.client:
            return

        pubsub = redis_instance.client.pubsub()
        await pubsub.subscribe(f"notifications:{user_id}")
        
        try:
            while True:
                # Check if client disconnected
                if await request.is_disconnected():
                    break
                
                # Listen for messages
                message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
                if message is not None:
                    yield {
                        "event": "notification",
                        "data": message["data"]
                    }
                
                # Send heartbeat every 30 seconds
                # We can use a simple counter for this
                if not hasattr(event_generator, "last_heartbeat"):
                    event_generator.last_heartbeat = datetime.utcnow()
                
                if (datetime.utcnow() - event_generator.last_heartbeat).total_seconds() > 30:
                    yield {
                        "event": "heartbeat",
                        "data": json.dumps({"timestamp": datetime.utcnow().isoformat()})
                    }
                    event_generator.last_heartbeat = datetime.utcnow()
                
                await asyncio.sleep(0.1)
        except asyncio.CancelledError:
            pass
        finally:
            await pubsub.unsubscribe(f"notifications:{user_id}")
            await pubsub.close()

    def format_sse(data: dict):
        event = data.get("event")
        payload = data.get("data")
        return f"event: {event}\ndata: {payload}\n\n"

    async def sse_wrapper():
        async for event in event_generator():
            yield format_sse(event)

    return StreamingResponse(
        sse_wrapper(),
        headers={
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )
