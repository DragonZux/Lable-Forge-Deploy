"""
Custom exception handlers for consistent error responses.
"""

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from bson.errors import InvalidId
from pydantic import ValidationError
from datetime import datetime
import logging
import traceback

logger = logging.getLogger(__name__)


class APIException(Exception):
    """Custom API exception with status code and detail."""

    def __init__(
        self,
        detail: str,
        status_code: int = status.HTTP_400_BAD_REQUEST,
        code: str = "ERROR",
    ):
        self.detail = detail
        self.status_code = status_code
        self.code = code
        super().__init__(detail)


async def api_exception_handler(request: Request, exc: APIException):
    """Handle custom API exceptions."""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "detail": exc.detail,
            "code": exc.code,
            "timestamp": datetime.utcnow().isoformat(),
            "path": str(request.url.path),
        },
    )


async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Handle Pydantic validation errors."""
    errors = exc.errors()
    detail = []

    for error in errors:
        field = ".".join(str(x) for x in error["loc"][1:])
        detail.append(f"{field}: {error['msg']}")

    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "detail": "Validation failed",
            "errors": detail,
            "code": "VALIDATION_ERROR",
            "timestamp": datetime.utcnow().isoformat(),
            "path": str(request.url.path),
        },
    )


async def invalid_object_id_handler(request: Request, exc: InvalidId):
    """Handle invalid MongoDB ObjectId path/query values consistently."""
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content={
            "detail": "Invalid ID",
            "code": "INVALID_ID",
            "timestamp": datetime.utcnow().isoformat(),
            "path": str(request.url.path),
        },
    )


async def general_exception_handler(request: Request, exc: Exception):
    """Handle unexpected exceptions."""
    # Log full error with traceback
    logger.error(
        f"Unhandled exception: {exc}",
        exc_info=True,
        extra={"path": str(request.url.path)},
    )

    # Don't expose internal details in production
    detail = "An internal server error occurred"
    if request.app.debug:
        detail = str(exc)

    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "detail": detail,
            "code": "INTERNAL_ERROR",
            "timestamp": datetime.utcnow().isoformat(),
            "path": str(request.url.path),
        },
    )


def register_exception_handlers(app: FastAPI):
    """Register all exception handlers with the FastAPI app."""
    app.add_exception_handler(APIException, api_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(InvalidId, invalid_object_id_handler)
    app.add_exception_handler(Exception, general_exception_handler)
