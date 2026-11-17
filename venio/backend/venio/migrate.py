"""Exécute les migrations SQL (venio/migrations/NNNN_*.sql) dans l'ordre, une seule fois chacune.

Usage : python -m venio.migrate   (utilise VENIO_DATABASE_ADMIN_URL)
"""
import asyncio
import os
from pathlib import Path

import asyncpg

from .config import get_settings

MIGRATIONS_DIR = Path(__file__).parent / "migrations"


def _dsn(url: str) -> str:
    return url.replace("postgresql+asyncpg://", "postgresql://")


async def migrate(admin_url: str | None = None) -> list[str]:
    conn = await asyncpg.connect(_dsn(admin_url or get_settings().database_admin_url))
    applied: list[str] = []
    try:
        await conn.execute(
            "CREATE TABLE IF NOT EXISTS schema_migration (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())"
        )
        done = {r["name"] for r in await conn.fetch("SELECT name FROM schema_migration")}
        for path in sorted(MIGRATIONS_DIR.glob("*.sql")):
            if path.name in done:
                continue
            async with conn.transaction():
                await conn.execute(path.read_text(encoding="utf-8"))
                await conn.execute("INSERT INTO schema_migration (name) VALUES ($1)", path.name)
            applied.append(path.name)
        # Rattache le rôle de connexion de l'application au groupe venio_app (sans BYPASSRLS).
        app_role = os.environ.get("VENIO_APP_DB_ROLE")
        if app_role:
            if not app_role.replace("_", "").isalnum():
                raise ValueError("VENIO_APP_DB_ROLE invalide")
            await conn.execute(f'GRANT venio_app TO "{app_role}"')
    finally:
        await conn.close()
    return applied


if __name__ == "__main__":
    for name in asyncio.run(migrate()):
        print("appliquée :", name)
