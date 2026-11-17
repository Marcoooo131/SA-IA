from typing import Any

from fastapi import HTTPException


def api_error(status: int, code: str, message: str, **extra: Any) -> HTTPException:
    """Erreur JSON stable : {"detail": {"code", "message", ...}}."""
    return HTTPException(status_code=status, detail={"code": code, "message": message, **extra})
