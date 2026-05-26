import secrets
from datetime import datetime, timedelta


def generate_invitation_token() -> str:
    return secrets.token_urlsafe(32)


def is_invitation_expired(expires_at: datetime) -> bool:
    return datetime.utcnow() > expires_at


def get_expires_at(days: int = 7) -> datetime:
    return datetime.utcnow() + timedelta(days=days)


def format_role_display(role: str) -> str:
    roles = {
        "admin": "Administrator",
        "member": "Member",
        "viewer": "Viewer",
        "annotator": "Annotator",
        "reviewer": "Reviewer",
    }
    return roles.get(role, role)
