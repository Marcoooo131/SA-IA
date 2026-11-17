"""Accès base de données. Toute requête métier passe par `tx()`, qui positionne le contexte RLS."""
import json
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncEngine, create_async_engine

from .config import get_settings

_engine: AsyncEngine | None = None


def get_engine() -> AsyncEngine:
    global _engine
    if _engine is None:
        _engine = create_async_engine(get_settings().database_url, pool_pre_ping=True, pool_size=10)
    return _engine


async def dispose_engine() -> None:
    global _engine
    if _engine is not None:
        await _engine.dispose()
        _engine = None


@asynccontextmanager
async def tx(
    tenant_id: UUID | str | None = None,
    user_id: UUID | str | None = None,
    public_slug: str | None = None,
) -> AsyncIterator[AsyncConnection]:
    """Transaction avec contexte RLS local à la transaction (équivalent SET LOCAL)."""
    async with get_engine().begin() as conn:
        await conn.execute(
            text(
                "SELECT set_config('app.tenant_id', :t, true),"
                " set_config('app.user_id', :u, true),"
                " set_config('app.public_slug', :s, true)"
            ),
            {"t": str(tenant_id or ""), "u": str(user_id or ""), "s": public_slug or ""},
        )
        yield conn


async def set_tenant(conn: AsyncConnection, tenant_id: UUID | str) -> None:
    await conn.execute(text("SELECT set_config('app.tenant_id', :t, true)"), {"t": str(tenant_id)})


def j(value: Any) -> str:
    """Sérialise une valeur pour un paramètre `CAST(:x AS jsonb)`."""
    return json.dumps(value, ensure_ascii=False, default=str)


async def fetch_all(conn: AsyncConnection, sql: str, **params: Any) -> list[dict[str, Any]]:
    res = await conn.execute(text(sql), params)
    return [dict(r._mapping) for r in res]


async def fetch_one(conn: AsyncConnection, sql: str, **params: Any) -> dict[str, Any] | None:
    res = await conn.execute(text(sql), params)
    row = res.first()
    return dict(row._mapping) if row else None


async def execute(conn: AsyncConnection, sql: str, **params: Any) -> None:
    await conn.execute(text(sql), params)


def is_sqlstate(exc: BaseException, code: str) -> bool:
    orig = getattr(exc, "orig", None)
    for candidate in (orig, getattr(orig, "__cause__", None)):
        if candidate is not None and getattr(candidate, "sqlstate", None) == code:
            return True
    return False
