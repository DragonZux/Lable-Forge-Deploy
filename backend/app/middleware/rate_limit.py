"""
Rate limiting middleware using Redis.
"""

from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse, Response
from typing import Callable
import logging
from ..core.redis import get_redis

logger = logging.getLogger(__name__)


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Rate limiting middleware that tracks requests by IP address using Redis.
    Different limits for different endpoints.
    """

    # Rate limit configuration: (max_requests, time_window_seconds)
    LIMITS = {
        "general": (1000, 60),  # 1000 requests per minute
        "upload": (100, 60),    # 100 requests per minute
        "auth_sensitive": (10, 60),  # 10 login/register attempts per minute
        "auth": (120, 60),      # 120 other auth requests per minute
    }

    async def dispatch(self, request: Request, call_next: Callable) -> JSONResponse:
        """
        Process request and check rate limits.
        """
        # Get client IP
        client_ip = request.client.host if request.client else "unknown"

        # Determine which rate limit applies
        path = request.url.path
        if path in {"/api/auth/login", "/api/auth/register"}:
            limit_type = "auth_sensitive"
            max_requests, window = self.LIMITS["auth_sensitive"]
        elif path.startswith("/api/images/upload"):
            limit_type = "upload"
            max_requests, window = self.LIMITS["upload"]
        elif path.startswith("/api/auth"):
            limit_type = "auth"
            max_requests, window = self.LIMITS["auth"]
        else:
            limit_type = "general"
            max_requests, window = self.LIMITS["general"]

        # Check rate limit
        redis = await get_redis()
        key = f"rate_limit:{limit_type}:{client_ip}"

        try:
            # Get current request count
            current = await redis.incr(key)

            # Set expiry on first request
            if current == 1:
                await redis.expire(key, window)

            # Check if exceeded
            if current > max_requests:
                retry_after = await redis.ttl(key)
                return JSONResponse(
                    status_code=429,
                    content={
                        "detail": "Rate limit exceeded",
                        "code": "RATE_LIMIT_EXCEEDED",
                        "retry_after": retry_after,
                    },
                    headers={"Retry-After": str(retry_after)},
                )

            # Add rate limit info to request state for logging
            request.state.rate_limit_remaining = max_requests - current
            request.state.rate_limit_reset = await redis.ttl(key)

        except Exception as e:
            # If Redis is down, allow request but log error
            logger.warning("Rate limit check failed: %s", e)

        try:
            response = await call_next(request)
        except RuntimeError as exc:
            if str(exc) == "No response returned." and await request.is_disconnected():
                return Response(status_code=204)
            raise
        return response
