from typing import Any, List
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    PROJECT_NAME: str = "VisionFlow"
    VERSION: str = "1.0.0"
    
    # MongoDB
    MONGO_URI: str = "mongodb://localhost:27017"
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
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3002",
        "http://localhost:3330",
        "http://localhost:3333",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "http://127.0.0.1:3002",
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
