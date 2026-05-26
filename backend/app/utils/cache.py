from functools import wraps
import json
import logging
from typing import Any, Callable, Optional
from app.core.redis import cache_get, cache_set
import hashlib

logger = logging.getLogger(__name__)

def cache_response(ttl: int = 300, key_prefix: str = "api_cache"):
    """
    Decorator to cache FastAPI response in Redis.
    The cache key is generated from the function name and its arguments.
    """
    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Generate a cache key based on function name and stable arguments.
            # Authenticated responses must include the user id to avoid cross-user data leaks.
            stable_kwargs = {}
            for key, value in kwargs.items():
                if key in ["db", "redis"]:
                    continue
                if key in ["current_user", "user"]:
                    stable_kwargs[key] = getattr(value, "id", str(value))
                else:
                    stable_kwargs[key] = value
            
            arg_str = f"{args}:{stable_kwargs}"
            arg_hash = hashlib.md5(arg_str.encode()).hexdigest()
            cache_key = f"{key_prefix}:{func.__name__}:{arg_hash}"
            
            try:
                # Try to get from cache
                cached_val = await cache_get(cache_key)
                if cached_val is not None:
                    return cached_val
            except Exception as e:
                logger.error(f"Cache get error: {e}")
            
            # Execute the function
            result = await func(*args, **kwargs)
            
            try:
                # Save to cache
                await cache_set(cache_key, result, ttl=ttl)
            except Exception as e:
                logger.error(f"Cache set error: {e}")
                
            return result
        return wrapper
    return decorator
