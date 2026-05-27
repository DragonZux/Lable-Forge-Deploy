import logging
from pathlib import Path
from typing import Optional

from fastapi_mail import ConnectionConfig, FastMail, MessageSchema, MessageType

from app.core.config import settings

logger = logging.getLogger(__name__)


def _email_config_error() -> Optional[str]:
    if not settings.SEND_EMAILS:
        return "email sending is disabled"
    missing = [
        name
        for name, value in {
            "SMTP_HOST": settings.SMTP_HOST,
            "SMTP_PORT": settings.SMTP_PORT,
            "SMTP_USER": settings.SMTP_USER,
            "SMTP_PASSWORD": settings.SMTP_PASSWORD,
            "SMTP_FROM_EMAIL": settings.SMTP_FROM_EMAIL,
        }.items()
        if not value
    ]
    if missing:
        return f"missing email settings: {', '.join(missing)}"
    return None


conf = ConnectionConfig(
    MAIL_USERNAME=settings.SMTP_USER,
    MAIL_PASSWORD=settings.SMTP_PASSWORD,
    MAIL_FROM=settings.SMTP_FROM_EMAIL,
    MAIL_PORT=settings.SMTP_PORT,
    MAIL_SERVER=settings.SMTP_HOST,
    MAIL_FROM_NAME=settings.SMTP_FROM_NAME,
    MAIL_STARTTLS=True,
    MAIL_SSL_TLS=False,
    USE_CREDENTIALS=True,
    VALIDATE_CERTS=True,
    TEMPLATE_FOLDER=Path(__file__).parent.parent / "templates" / "emails",
)


class EmailService:
    @staticmethod
    async def send_workspace_invitation(
        invitee_email: str,
        invitee_name: Optional[str],
        invited_by_name: str,
        workspace_name: str,
        role: str,
        invitation_token: str,
        message: Optional[str],
        invitee_has_account: bool,
    ):
        config_error = _email_config_error()
        if config_error:
            logger.warning(
                "Skipped workspace invitation email to %s: %s",
                invitee_email,
                config_error,
            )
            return

        accept_path = f"/invitations/workspace/{invitation_token}/accept"
        if not invitee_has_account:
            accept_path = f"/register?invitation={invitation_token}&type=workspace"

        accept_url = f"{settings.FRONTEND_URL}{accept_path}"
        decline_url = f"{settings.FRONTEND_URL}/invitations/workspace/{invitation_token}/decline"

        message_schema = MessageSchema(
            subject=f"Invitation to join workspace {workspace_name} - LabelForge",
            recipients=[invitee_email],
            template_body={
                "invitee_name": invitee_name,
                "invited_by_name": invited_by_name,
                "workspace_name": workspace_name,
                "role": role,
                "message": message,
                "accept_url": accept_url,
                "decline_url": decline_url,
            },
            subtype=MessageType.html,
        )

        fm = FastMail(conf)
        try:
            await fm.send_message(message_schema, template_name="workspace_invitation.html")
            logger.info("Sent workspace invitation email to %s", invitee_email)
        except Exception as e:
            logger.error("Failed to send workspace invitation email to %s: %s", invitee_email, str(e))

    @staticmethod
    async def send_project_invitation(
        invitee_email: str,
        invitee_name: Optional[str],
        invited_by_name: str,
        project_name: str,
        workspace_name: str,
        role: str,
        invitation_token: str,
        message: Optional[str],
        invitee_has_account: bool,
    ):
        config_error = _email_config_error()
        if config_error:
            logger.warning(
                "Skipped project invitation email to %s: %s",
                invitee_email,
                config_error,
            )
            return

        accept_path = f"/invitations/project/{invitation_token}/accept"
        if not invitee_has_account:
            accept_path = f"/register?invitation={invitation_token}&type=project"

        accept_url = f"{settings.FRONTEND_URL}{accept_path}"
        decline_url = f"{settings.FRONTEND_URL}/invitations/project/{invitation_token}/decline"

        message_schema = MessageSchema(
            subject=f"Invitation to join project {project_name} - LabelForge",
            recipients=[invitee_email],
            template_body={
                "invitee_name": invitee_name,
                "invited_by_name": invited_by_name,
                "project_name": project_name,
                "workspace_name": workspace_name,
                "role": role,
                "message": message,
                "accept_url": accept_url,
                "decline_url": decline_url,
            },
            subtype=MessageType.html,
        )

        fm = FastMail(conf)
        try:
            await fm.send_message(message_schema, template_name="project_invitation.html")
            logger.info("Sent project invitation email to %s", invitee_email)
        except Exception as e:
            logger.error("Failed to send project invitation email to %s: %s", invitee_email, str(e))
