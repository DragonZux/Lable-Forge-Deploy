
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from redis.asyncio import Redis

async def check():
    print("Checking MongoDB...")
    try:
        client = AsyncIOMotorClient("mongodb://localhost:27018", serverSelectionTimeoutMS=2000)
        await client.admin.command('ping')
        print("MongoDB OK")
    except Exception as e:
        print(f"MongoDB Failed: {e}")

    print("Checking Redis...")
    try:
        r = Redis.from_url("redis://localhost:6379", socket_timeout=2)
        await r.ping()
        print("Redis OK")
    except Exception as e:
        print(f"Redis Failed: {e}")

if __name__ == "__main__":
    asyncio.run(check())
