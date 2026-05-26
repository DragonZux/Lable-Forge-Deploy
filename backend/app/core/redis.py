import redis.asyncio as redis
from app.core.config import settings
import json

class RedisClient:
    client: redis.Redis = None

redis_instance = RedisClient()

async def connect_redis():
    redis_instance.client = redis.from_url(settings.REDIS_URL, decode_responses=True)

async def get_redis() -> redis.Redis:
    from fastapi import HTTPException, status

    if redis_instance.client is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Redis not connected",
        )

    return redis_instance.client

async def cache_set(key: str, value: any, ttl: int = 300):
    client = await get_redis()
    # Use a custom default to handle datetime objects just in case
    json_value = json.dumps(value, default=lambda o: o.isoformat() if hasattr(o, 'isoformat') else str(o))
    await client.set(key, json_value, ex=ttl)

async def cache_get(key: str):
    client = await get_redis()
    value = await client.get(key)
    return json.loads(value) if value else None

async def cache_delete(key: str):
    client = await get_redis()
    await client.delete(key)
