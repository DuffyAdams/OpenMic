from fastapi import Request
from fastapi.responses import JSONResponse


class AppError(Exception):
    """An expected, user-facing error with a stable machine-readable code."""

    def __init__(self, status: int, code: str, message: str, **extra):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.extra = extra


def unauthorized(message: str = "Authentication required") -> AppError:
    return AppError(401, "unauthorized", message)


def forbidden(message: str = "You are not allowed to do that") -> AppError:
    return AppError(403, "forbidden", message)


def not_found(message: str = "Not found") -> AppError:
    return AppError(404, "not_found", message)


async def app_error_handler(_request: Request, exc: AppError) -> JSONResponse:
    body = {"error": {"code": exc.code, "message": exc.message, **exc.extra}}
    headers = {}
    if exc.status == 429 and "retry_after" in exc.extra:
        headers["Retry-After"] = str(int(exc.extra["retry_after"]))
    return JSONResponse(status_code=exc.status, content=body, headers=headers)
