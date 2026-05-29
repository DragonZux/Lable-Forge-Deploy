import os
import logging
from typing import Annotated, Any, List
from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

class Settings(BaseSettings):
    PROJECT_NAME: str = "Label Forge"
    VERSION: str = "1.0.0"
    
    # MongoDB
    MONGO_URI: str = "mongodb://localhost:27018"
    MONGO_DB_NAME: str = "labelforge"
    
    # Redis
    REDIS_URL: str = "redis://localhost:6379"
    
    # MinIO
    MINIO_ENDPOINT: str = "http://localhost:9000"
    MINIO_PUBLIC_ENDPOINT: str = "http://localhost:9000"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin"
    MINIO_BUCKET_NAME: str = "labelforge"
    
    # JWT
    JWT_SECRET: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 10080  # 7 days
    SESSION_IDLE_TIMEOUT_MINUTES: int = 30
    COOKIE_SECURE: bool = False
    GOOGLE_CLIENT_ID: str = ""
    
    # CORS
    CORS_ORIGINS: Annotated[List[str], NoDecode] = [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3002",
        "http://localhost:3330",
        "http://localhost:3333",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "http://127.0.0.1:3002",
        "https://label-forge-one.vercel.app",
        "https://label-forge-dragonzuxs-projects.vercel.app",
    ]

    # Email (SMTP)
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM_EMAIL: str = "noreply@labelforge.com"
    SMTP_FROM_NAME: str = "LabelForge"
    FRONTEND_URL: str = "http://localhost:3000"
    BACKEND_PUBLIC_URL: str = ""
    SEND_EMAILS: bool = False  # Set to True in production

    # CVAT integration
    CVAT_URL: str = "http://localhost:8080"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: Any) -> Any:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

settings = Settings()

def get_active_backend_url() -> str:
    """Dynamically reads the .env file to fetch the latest BACKEND_PUBLIC_URL,
    preventing stale/cached tunnel URLs inside running containers.
    """
    env_paths = ["/app/.env", ".env", "../.env"]
    for path in env_paths:
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line.startswith("BACKEND_PUBLIC_URL="):
                            val = line.split("=", 1)[1].strip()
                            if val.startswith(('"', "'")) and val.endswith(('"', "'")):
                                val = val[1:-1].strip()
                            if val:
                                return val
            except Exception as e:
                logging.getLogger(__name__).error(f"Error reading .env at {path}: {e}")
                
    # Fallback to Pydantic Settings, environment variables or default
    val = settings.BACKEND_PUBLIC_URL.strip() or os.environ.get("BACKEND_PUBLIC_URL", "").strip() or os.environ.get("BACKEND_URL", "").strip()
    if val:
        return val
    return "http://localhost:8000"
