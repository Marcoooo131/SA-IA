from __future__ import annotations

from sqlalchemy.orm import Session

from .models import AuditLog


def audit(session: Session, actor: str, action: str, target: str | None = None, **details) -> None:
    """Record an administrative / access action. ``details`` must not contain conversation content."""
    session.add(AuditLog(actor=actor, action=action, target=target, details=details))
