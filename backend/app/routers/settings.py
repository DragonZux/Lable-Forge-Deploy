"""
Settings router for user profile and account management.
"""

from fastapi import APIRouter, Depends, HTTPException, status, File, UploadFile
from pydantic import BaseModel, Field, ConfigDict
from datetime import datetime
from typing import Optional
from bson import ObjectId
import uuid
from ..core.database import get_database
from ..core.redis import get_redis
from ..core.storage import storage_client
from ..utils.auth import get_current_user, hash_password, verify_password, invalidate_all_user_sessions
from ..models.user import UserInDB, UserResponse

router = APIRouter(prefix="/settings", tags=["Settings"])


ALLOWED_IMAGE_TYPES = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/bmp": "bmp",
    "image/webp": "webp",
}


def _detect_image_content_type(file_bytes: bytes) -> Optional[str]:
    if file_bytes.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if file_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if file_bytes.startswith(b"BM"):
        return "image/bmp"
    if (
        len(file_bytes) >= 12
        and file_bytes.startswith(b"RIFF")
        and file_bytes[8:12] == b"WEBP"
    ):
        return "image/webp"
    return None


def resolve_avatar_url(avatar_url: Optional[str]) -> Optional[str]:
    if not avatar_url:
        return None
    if avatar_url.startswith("avatars/"):
        try:
            return storage_client.generate_presigned_url(avatar_url, expires=604800) # 7 days
        except Exception:
            return None
    return avatar_url


class ProfileUpdate(BaseModel):
    """Update user profile."""
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "full_name": "John Doe",
                "avatar_url": "https://example.com/avatar.jpg"
            }
        }
    )

    full_name: Optional[str] = Field(None, min_length=1, max_length=200)
    avatar_url: Optional[str] = None


class PasswordChange(BaseModel):
    """Change user password."""
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "current_password": "old_password_123",
                "new_password": "new_password_123"
            }
        }
    )

    current_password: str = Field(..., min_length=8)
    new_password: str = Field(..., min_length=8)


class PasswordChangeResponse(BaseModel):
    """Response for password change."""
    message: str = "Password updated successfully"


class AccountDeleteConfirm(BaseModel):
    """Confirm account deletion."""
    email: str = Field(..., description="User email for confirmation")


class AccountDeleteResponse(BaseModel):
    """Response for account deletion."""
    message: str = "Account deleted successfully"


@router.get("/profile", response_model=UserResponse)
async def get_profile(
    current_user: UserInDB = Depends(get_current_user)
) -> UserResponse:
    """
    Get current user profile.
    """
    return UserResponse(
        id=str(current_user.id),
        email=current_user.email,
        full_name=current_user.full_name,
        avatar_url=resolve_avatar_url(getattr(current_user, "avatar_url", None)),
        created_at=current_user.created_at
    )


@router.patch("/profile", response_model=UserResponse)
async def update_profile(
    update_data: ProfileUpdate,
    current_user: UserInDB = Depends(get_current_user),
    db = Depends(get_database),
    redis = Depends(get_redis)
) -> UserResponse:
    """
    Update user profile (full_name, avatar_url).
    """
    update_dict = update_data.model_dump(exclude_unset=True)

    if not update_dict:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update"
        )

    # Update in MongoDB
    result = await db.users.find_one_and_update(
        {"_id": ObjectId(current_user.id)},
        {"$set": update_dict},
        return_document=True
    )

    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    # Invalidate cache
    cache_key = f"user:{current_user.id}"
    await redis.delete(cache_key)

    # Update localStorage by returning new user data
    return UserResponse(
        id=str(result["_id"]),
        email=result["email"],
        full_name=result.get("full_name", ""),
        avatar_url=resolve_avatar_url(result.get("avatar_url")),
        created_at=result.get("created_at", datetime.utcnow())
    )


@router.post("/avatar", response_model=UserResponse)
async def upload_avatar(
    file: UploadFile = File(...),
    current_user: UserInDB = Depends(get_current_user),
    db = Depends(get_database),
    redis = Depends(get_redis)
) -> UserResponse:
    """
    Upload and update user profile avatar.
    """
    file_bytes = await file.read()
    
    # Validate size (max 5MB)
    max_file_size = 5 * 1024 * 1024
    if len(file_bytes) > max_file_size:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File too large (max 5MB)"
        )
        
    detected_content_type = _detect_image_content_type(file_bytes)
    if not detected_content_type or detected_content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid image type. Allowed: JPG, PNG, BMP, WEBP"
        )
        
    # Generate unique filename for avatar
    ext = ALLOWED_IMAGE_TYPES[detected_content_type]
    unique_filename = f"avatars/{current_user.id}_{uuid.uuid4().hex}.{ext}"
    
    # Upload to storage
    storage_client.upload_file(
        file_bytes=file_bytes,
        filename=unique_filename,
        content_type=detected_content_type
    )
    
    # Update in MongoDB with the path
    result = await db.users.find_one_and_update(
        {"_id": ObjectId(current_user.id)},
        {"$set": {"avatar_url": unique_filename, "updated_at": datetime.utcnow()}},
        return_document=True
    )
    
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
        
    # Invalidate cache
    cache_key = f"user:{current_user.id}"
    await redis.delete(cache_key)
    
    return UserResponse(
        id=str(result["_id"]),
        email=result["email"],
        full_name=result.get("full_name", ""),
        avatar_url=resolve_avatar_url(result.get("avatar_url")),
        created_at=result.get("created_at", datetime.utcnow())
    )


@router.patch("/password", response_model=PasswordChangeResponse)
async def change_password(
    password_data: PasswordChange,
    current_user: UserInDB = Depends(get_current_user),
    db = Depends(get_database),
    redis = Depends(get_redis)
) -> PasswordChangeResponse:
    """
    Change user password.
    Requires verification of current password.
    """
    # Verify current password
    if not verify_password(password_data.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect"
        )

    # Hash new password
    hashed_new_password = hash_password(password_data.new_password)

    # Update in MongoDB
    await db.users.update_one(
        {"_id": ObjectId(current_user.id)},
        {"$set": {"hashed_password": hashed_new_password}}
    )

    # Invalidate current active session
    await invalidate_all_user_sessions(current_user.id)

    # Also invalidate user cache
    cache_key = f"user:{current_user.id}"
    await redis.delete(cache_key)

    return PasswordChangeResponse()


@router.delete("/account", response_model=AccountDeleteResponse)
async def delete_account(
    delete_data: AccountDeleteConfirm,
    current_user: UserInDB = Depends(get_current_user),
    db = Depends(get_database),
    redis = Depends(get_redis)
) -> AccountDeleteResponse:
    """
    Delete user account (soft delete: set is_active=false).
    Requires email confirmation.
    """
    # Verify email matches
    if delete_data.email != current_user.email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email confirmation does not match"
        )

    # Soft delete: set is_active = false
    await db.users.update_one(
        {"_id": ObjectId(current_user.id)},
        {"$set": {"is_active": False, "deleted_at": datetime.utcnow()}}
    )

    # Delete active session
    await invalidate_all_user_sessions(current_user.id)

    # Clear user cache
    cache_key = f"user:{current_user.id}"
    await redis.delete(cache_key)

    return AccountDeleteResponse()
