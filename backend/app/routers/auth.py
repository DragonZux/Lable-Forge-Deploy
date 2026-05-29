import secrets
from bson import ObjectId
from typing import Optional, Tuple
from fastapi import APIRouter, HTTPException, status, Depends, Response, Request, Form
from fastapi.responses import RedirectResponse
from starlette.concurrency import run_in_threadpool
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from app.models.user import UserCreate, UserResponse, Token, UserInDB, UserLogin, GoogleLogin, UserUpdate, PasswordUpdate, ForgotPasswordRequest, ResetPasswordRequest
from app.models.workspace import MemberRef
from app.core.database import get_database
from app.core.config import settings
from app.core.redis import cache_set, cache_delete, cache_get
from app.utils.auth import (
    hash_password,
    verify_password,
    create_access_token,
    decode_token,
    get_current_user,
    generate_session_id,
    create_user_session,
    invalidate_user_session,
)
from datetime import datetime

router = APIRouter(prefix="/auth", tags=["Authentication"])


def _set_auth_cookie(response: Response, access_token: str) -> None:
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        samesite="lax",
        secure=settings.COOKIE_SECURE,
        path="/",
    )


from app.core.storage import storage_client

def resolve_avatar_url(avatar_url: Optional[str]) -> Optional[str]:
    if not avatar_url:
        return None
    if avatar_url.startswith("avatars/"):
        try:
            return storage_client.generate_presigned_url(avatar_url, expires=604800) # 7 days
        except Exception:
            return None
    return avatar_url


async def _create_login_response(user_doc: dict, response: Response, default_workspace_id: Optional[str] = None) -> dict:
    user_id = str(user_doc["_id"])
    session_id = generate_session_id()
    await create_user_session(user_id, session_id)
    access_token = create_access_token(data={"sub": user_id, "sid": session_id})

    user_response = UserResponse(
        id=user_id,
        email=user_doc["email"],
        full_name=user_doc["full_name"],
        avatar_url=resolve_avatar_url(user_doc.get("avatar_url")),
        created_at=user_doc["created_at"]
    )
    await cache_set(f"user:{user_id}", user_response.model_dump(mode='json'), ttl=3600)
    _set_auth_cookie(response, access_token)

    payload = {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user_response.model_dump(),
    }
    if default_workspace_id:
        payload["default_workspace_id"] = default_workspace_id
    return payload


async def _verify_google_credential(credential: str) -> dict:
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google login is not configured"
        )

    try:
        google_payload = await run_in_threadpool(
            id_token.verify_oauth2_token,
            credential,
            google_requests.Request(),
            settings.GOOGLE_CLIENT_ID,
        )
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Google credential",
            headers={"WWW-Authenticate": "Bearer"}
        )

    email = google_payload.get("email")
    google_sub = google_payload.get("sub")
    email_verified = google_payload.get("email_verified")
    if not email or not google_sub or not email_verified:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google account email is not verified",
            headers={"WWW-Authenticate": "Bearer"}
        )

    return google_payload


async def _find_or_create_google_user(google_payload: dict) -> Tuple[dict, Optional[str]]:
    db = get_database()
    normalized_email = google_payload["email"].lower()
    user_doc = await db.users.find_one({"email": normalized_email})
    default_workspace_id = None

    if user_doc:
        if user_doc.get("is_active") is False:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Account is inactive",
                headers={"WWW-Authenticate": "Bearer"}
            )

        update_fields = {
            "google_sub": google_payload["sub"],
            "auth_provider": user_doc.get("auth_provider", "google"),
            "updated_at": datetime.utcnow(),
        }
        if google_payload.get("picture"):
            update_fields["avatar_url"] = google_payload["picture"]
        await db.users.update_one({"_id": user_doc["_id"]}, {"$set": update_fields})
        user_doc.update(update_fields)
        return user_doc, default_workspace_id

    full_name = google_payload.get("name") or normalized_email.split("@")[0]
    user_doc = {
        "email": normalized_email,
        "full_name": full_name,
        "hashed_password": hash_password(secrets.token_urlsafe(32)),
        "auth_provider": "google",
        "google_sub": google_payload["sub"],
        "avatar_url": google_payload.get("picture"),
        "created_at": datetime.utcnow(),
        "is_active": True
    }
    result = await db.users.insert_one(user_doc)
    user_id = str(result.inserted_id)
    user_doc["_id"] = result.inserted_id

    default_workspace = {
        "name": f"{full_name}'s Workspace",
        "owner_id": user_id,
        "plan": "free",
        "members": [
            MemberRef(user_id=user_id, role="owner").model_dump()
        ],
        "created_at": datetime.utcnow()
    }
    workspace_result = await db.workspaces.insert_one(default_workspace)
    default_workspace_id = str(workspace_result.inserted_id)
    return user_doc, default_workspace_id


@router.post("/register", response_model=dict, status_code=status.HTTP_201_CREATED)
async def register(user_data: UserCreate, response: Response):
    db = get_database()
    normalized_email = user_data.email.lower()
    existing_user = await db.users.find_one({"email": normalized_email})
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    hashed_password = hash_password(user_data.password)
    user_doc = {
        "email": normalized_email,
        "full_name": user_data.full_name,
        "hashed_password": hashed_password,
        "created_at": datetime.utcnow(),
        "is_active": True
    }
    result = await db.users.insert_one(user_doc)
    user_id = str(result.inserted_id)
    user_doc["_id"] = result.inserted_id
    default_workspace = {
        "name": f"{user_data.full_name}'s Workspace",
        "owner_id": user_id,
        "plan": "free",
        "members": [
            MemberRef(user_id=user_id, role="owner").model_dump()
        ],
        "created_at": datetime.utcnow()
    }
    workspace_result = await db.workspaces.insert_one(default_workspace)
    return await _create_login_response(user_doc, response, str(workspace_result.inserted_id))


@router.post("/login", response_model=dict)
async def login(login_data: UserLogin, response: Response):
    db = get_database()
    normalized_email = login_data.email.lower()
    user_doc = await db.users.find_one({"email": normalized_email})
    if (
        not user_doc
        or user_doc.get("is_active") is False
        or not verify_password(login_data.password, user_doc["hashed_password"])
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"}
        )
    return await _create_login_response(user_doc, response)


@router.post("/google", response_model=dict)
async def google_login(login_data: GoogleLogin, response: Response):
    google_payload = await _verify_google_credential(login_data.credential)
    user_doc, default_workspace_id = await _find_or_create_google_user(google_payload)
    return await _create_login_response(user_doc, response, default_workspace_id)


@router.post("/google/redirect")
async def google_login_redirect(request: Request, credential: str = Form(...)):
    google_payload = await _verify_google_credential(credential)
    user_doc, _ = await _find_or_create_google_user(google_payload)
    redirect_url = f"{settings.FRONTEND_URL.rstrip('/')}/dashboard"
    redirect_response = RedirectResponse(
        url=redirect_url,
        status_code=status.HTTP_303_SEE_OTHER,
    )
    await _create_login_response(user_doc, redirect_response)
    return redirect_response


@router.get("/me", response_model=UserResponse)
async def get_current_user_profile(current_user: UserInDB = Depends(get_current_user)):
    return UserResponse(
        id=current_user.id,
        email=current_user.email,
        full_name=current_user.full_name,
        avatar_url=resolve_avatar_url(getattr(current_user, "avatar_url", None)),
        created_at=current_user.created_at
    )


@router.patch("/me", response_model=UserResponse)
async def update_profile(
    payload: UserUpdate,
    current_user: UserInDB = Depends(get_current_user),
    db = Depends(get_database)
):
    update_data = payload.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
    await db.users.update_one(
        {"_id": ObjectId(current_user.id)},
        {"$set": {**update_data, "updated_at": datetime.utcnow()}}
    )
    await cache_delete(f"user:{current_user.id}")
    updated_user = await db.users.find_one({"_id": ObjectId(current_user.id)})
    return UserResponse(
        id=str(updated_user["_id"]),
        email=updated_user["email"],
        full_name=updated_user["full_name"],
        avatar_url=resolve_avatar_url(updated_user.get("avatar_url")),
        created_at=updated_user["created_at"]
    )


@router.patch("/me/password")
async def update_password(
    payload: PasswordUpdate,
    current_user: UserInDB = Depends(get_current_user),
    db = Depends(get_database)
):
    user_doc = await db.users.find_one({"_id": ObjectId(current_user.id)})
    if not user_doc.get("hashed_password") or not verify_password(payload.current_password, user_doc["hashed_password"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    await db.users.update_one(
        {"_id": ObjectId(current_user.id)},
        {"$set": {"hashed_password": hash_password(payload.new_password), "updated_at": datetime.utcnow()}}
    )
    return {"message": "Password updated successfully"}


@router.delete("/me")
async def delete_account(
    current_user: UserInDB = Depends(get_current_user),
    db = Depends(get_database)
):
    """
    Delete current user's account.
    """
    await db.users.delete_one({"_id": ObjectId(current_user.id)})
    return {"message": "Account deleted successfully"}


@router.post("/logout")
async def logout(request: Request, response: Response):
    token = request.cookies.get("access_token")
    if token:
        try:
            payload = decode_token(token)
            if payload:
                user_id = payload.get("sub")
                session_id = payload.get("sid")
                if user_id:
                    await cache_delete(f"user:{user_id}")
                    await invalidate_user_session(user_id, session_id)
        except Exception:
            pass
    response.delete_cookie(
        key="access_token",
        path="/",
        httponly=True,
        samesite="lax",
        secure=settings.COOKIE_SECURE,
    )
    return {"message": "Logged out successfully"}


@router.post("/refresh", response_model=Token)
async def refresh_token(request: Request, current_user: UserInDB = Depends(get_current_user)):
    token = request.cookies.get("access_token")
    session_id = None
    if token:
        payload = decode_token(token)
        if payload:
            session_id = payload.get("sid")
    access_token = create_access_token(data={"sub": current_user.id, "sid": session_id})
    return Token(access_token=access_token, token_type="bearer")


@router.post("/forgot-password")
async def forgot_password(payload: ForgotPasswordRequest):
    db = get_database()
    normalized_email = payload.email.lower()
    user = await db.users.find_one({"email": normalized_email})
    
    if user:
        reset_token = secrets.token_urlsafe(32)
        # Store reset token in Redis for 1 hour (3600 seconds)
        await cache_set(f"password-reset:{reset_token}", {"email": normalized_email}, ttl=3600)
        
        # Send email
        from app.services.email_service import EmailService
        await EmailService.send_password_reset(
            recipient_email=normalized_email,
            recipient_name=user.get("full_name") or normalized_email.split("@")[0],
            reset_token=reset_token
        )
        
    return {"message": "If the email is registered in our system, a password reset link has been sent."}


@router.post("/reset-password")
async def reset_password(payload: ResetPasswordRequest):
    db = get_database()
    token_key = f"password-reset:{payload.token}"
    data = await cache_get(token_key)
    
    if not data or "email" not in data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired password reset token"
        )
        
    email = data["email"]
    
    # Hash and update new password
    hashed_password = hash_password(payload.new_password)
    result = await db.users.update_one(
        {"email": email},
        {"$set": {"hashed_password": hashed_password, "updated_at": datetime.utcnow()}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
        
    # Delete token from Redis
    await cache_delete(token_key)
    
    return {"message": "Password reset successfully"}

