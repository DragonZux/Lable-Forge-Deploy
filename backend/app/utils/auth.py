from datetime import datetime, timedelta
from typing import Optional
import logging
import secrets

import bcrypt
from bson import ObjectId
from fastapi import Depends, HTTPException, Query, Request, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt

from app.core.config import settings
from app.core.database import get_database
from app.core.redis import cache_delete, cache_get, cache_set
from app.models.user import UserInDB


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login", auto_error=False)

SESSION_REPLACED_MESSAGE = "T\u00e0i kho\u1ea3n \u0111\u00e3 \u0111\u01b0\u1ee3c \u0111\u0103ng nh\u1eadp \u1edf n\u01a1i kh\u00e1c."
SESSION_EXPIRED_MESSAGE = "Phi\u00ean \u0111\u0103ng nh\u1eadp \u0111\u00e3 h\u1ebft h\u1ea1n do kh\u00f4ng ho\u1ea1t \u0111\u1ed9ng trong 30 ph\u00fat. Vui l\u00f2ng \u0111\u0103ng nh\u1eadp l\u1ea1i."

logger = logging.getLogger(__name__)


def hash_password(password: str) -> str:
    """Hash a plain password using bcrypt."""
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode("utf-8"), salt)
    return hashed.decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain password against its hashed version."""
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"),
            hashed_password.encode("utf-8"),
        )
    except Exception:
        return False


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a JWT access token."""
    to_encode = data.copy()
    expire = datetime.utcnow() + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def generate_session_id() -> str:
    """Generate a random session id bound to one active login."""
    return secrets.token_urlsafe(32)


def decode_token(token: str) -> Optional[dict]:
    """Decode and validate a JWT token."""
    try:
        return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        return None


def _session_key(session_id: str) -> str:
    return f"session:{session_id}"


def _active_session_key(user_id: str) -> str:
    return f"user_active_session:{user_id}"


def _session_replaced_key(session_id: str) -> str:
    return f"session_replaced:{session_id}"


async def create_user_session(user_id: str, session_id: str) -> None:
    """Persist the only active session for a user with sliding expiration."""
    ttl = settings.SESSION_IDLE_TIMEOUT_MINUTES * 60
    previous_session = await cache_get(_active_session_key(user_id))
    previous_session_id = previous_session.get("session_id") if previous_session else None

    if previous_session_id and previous_session_id != session_id:
        await cache_set(
            _session_replaced_key(previous_session_id),
            {"reason": "logged_in_elsewhere"},
            ttl=ttl,
        )
        await cache_delete(_session_key(previous_session_id))

    await cache_set(_session_key(session_id), {"user_id": user_id, "session_id": session_id}, ttl=ttl)
    await cache_set(_active_session_key(user_id), {"session_id": session_id}, ttl=ttl)


async def invalidate_user_session(user_id: str, session_id: Optional[str]) -> None:
    """Remove the active session if it matches the current token session."""
    if not session_id:
        return

    active_session = await cache_get(_active_session_key(user_id))
    if active_session and active_session.get("session_id") == session_id:
        await cache_delete(_active_session_key(user_id))

    await cache_delete(_session_key(session_id))
    await cache_delete(_session_replaced_key(session_id))


async def invalidate_all_user_sessions(user_id: str) -> None:
    """Remove the current active session mapping for a user."""
    active_session = await cache_get(_active_session_key(user_id))
    if active_session:
        session_id = active_session.get("session_id")
        if session_id:
            await cache_delete(_session_key(session_id))
            await cache_delete(_session_replaced_key(session_id))

    await cache_delete(_active_session_key(user_id))


async def touch_user_session(user_id: str, session_id: str) -> None:
    """Refresh idle timeout for the active session."""
    ttl = settings.SESSION_IDLE_TIMEOUT_MINUTES * 60
    await cache_set(_session_key(session_id), {"user_id": user_id, "session_id": session_id}, ttl=ttl)
    await cache_set(_active_session_key(user_id), {"session_id": session_id}, ttl=ttl)


async def validate_user_session(user_id: str, session_id: Optional[str]) -> None:
    """Validate that the JWT belongs to the single active, non-expired session."""
    credentials_elsewhere = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=SESSION_REPLACED_MESSAGE,
        headers={"WWW-Authenticate": "Bearer"},
    )
    credentials_expired = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=SESSION_EXPIRED_MESSAGE,
        headers={"WWW-Authenticate": "Bearer"},
    )

    if not session_id:
        raise credentials_expired

    active_session = await cache_get(_active_session_key(user_id))
    if not active_session:
        raise credentials_expired

    active_session_id = active_session.get("session_id")
    if active_session_id != session_id:
        replaced_reason = await cache_get(_session_replaced_key(session_id))
        if replaced_reason:
            raise credentials_elsewhere
        raise credentials_expired

    session_data = await cache_get(_session_key(session_id))
    if not session_data:
        await cache_delete(_active_session_key(user_id))
        raise credentials_expired

    await touch_user_session(user_id, session_id)


async def get_current_user(
    request: Request,
    token: Optional[str] = Depends(oauth2_scheme),
    access_token: Optional[str] = Query(None),
) -> UserInDB:
    """Get the current authenticated user from JWT token in header or cookie."""
    if not token:
        token = request.cookies.get("access_token")
        if token:
            logger.info("Auth: Found token in cookie")
        elif access_token:
            token = access_token
            logger.info("Auth: Found token in query parameter")
        else:
            logger.info("Auth: No token in header or cookie")
    else:
        logger.info("Auth: Found token in Authorization header")

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if not token:
        raise credentials_exception

    payload = decode_token(token)
    if payload is None:
        logger.warning("Auth: Token decoding failed")
        raise credentials_exception

    user_id: Optional[str] = payload.get("sub")
    if user_id is None:
        logger.warning("Auth: Token payload missing 'sub' claim")
        raise credentials_exception

    await validate_user_session(user_id, payload.get("sid"))

    db = get_database()
    try:
        user_doc = await db.users.find_one({"_id": ObjectId(user_id)})
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Auth: Error fetching user: %s", exc)
        raise credentials_exception

    if user_doc is None:
        logger.warning("Auth: User not found for id: %s", user_id)
        raise credentials_exception
    if user_doc.get("is_active") is False:
        logger.warning("Auth: Inactive user attempted access: %s", user_id)
        raise credentials_exception

    user_doc["_id"] = str(user_doc["_id"])
    return UserInDB(**user_doc)
