"""Stockage des fichiers déposés.

VENIO_STORAGE_BACKEND=local (défaut) : disque (VENIO_STORAGE_DIR).
VENIO_STORAGE_BACKEND=supabase : bucket privé Supabase Storage (VENIO_SUPABASE_URL,
VENIO_SUPABASE_SERVICE_KEY, VENIO_SUPABASE_BUCKET). Obligatoire chez les hébergeurs dont le disque
est effacé à chaque redémarrage (offres gratuites).
"""
import io
import os
from pathlib import Path
from uuid import uuid4

import httpx
from PIL import Image, ImageOps

ALLOWED = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "application/pdf": ".pdf"}
MAX_BYTES = 10 * 1024 * 1024


class StorageError(ValueError):
    pass


def storage_root() -> Path:
    root = Path(os.environ.get("VENIO_STORAGE_DIR", "./var/uploads"))
    root.mkdir(parents=True, exist_ok=True)
    return root


def sanitize(data: bytes, mime: str) -> bytes:
    """Ré-encode les images pour supprimer les métadonnées (EXIF, position GPS)."""
    if mime == "application/pdf":
        if not data.startswith(b"%PDF-"):
            raise StorageError("Fichier PDF invalide.")
        return data
    try:
        img = Image.open(io.BytesIO(data))
        img = ImageOps.exif_transpose(img)
        img.thumbnail((2560, 2560))
        out = io.BytesIO()
        fmt = {"image/jpeg": "JPEG", "image/png": "PNG", "image/webp": "WEBP"}[mime]
        if fmt == "JPEG" and img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
        img.save(out, format=fmt, quality=85)
        return out.getvalue()
    except StorageError:
        raise
    except Exception as exc:  # image corrompue ou format menteur
        raise StorageError("Image illisible.") from exc


def _backend() -> str:
    return os.environ.get("VENIO_STORAGE_BACKEND", "local")


def _supabase() -> tuple[str, dict[str, str]]:
    url = os.environ["VENIO_SUPABASE_URL"].rstrip("/")
    bucket = os.environ.get("VENIO_SUPABASE_BUCKET", "venio-files")
    key = os.environ["VENIO_SUPABASE_SERVICE_KEY"]
    return f"{url}/storage/v1/object/{bucket}", {"Authorization": f"Bearer {key}", "apikey": key}


def save(tenant_id: str, data: bytes, mime: str) -> str:
    """Valide, nettoie et enregistre un fichier. Fonction bloquante : l'appeler via asyncio.to_thread."""
    if mime not in ALLOWED:
        raise StorageError("Format accepté : JPEG, PNG, WebP ou PDF.")
    if len(data) > MAX_BYTES:
        raise StorageError("Fichier trop volumineux (10 Mo maximum).")
    clean = sanitize(data, mime)
    key = f"{tenant_id}/{uuid4()}{ALLOWED[mime]}"
    if _backend() == "supabase":
        base, headers = _supabase()
        r = httpx.post(f"{base}/{key}", content=clean, headers={**headers, "Content-Type": mime, "x-upsert": "false"}, timeout=30)
        if r.status_code >= 300:
            raise RuntimeError(f"Supabase Storage {r.status_code}: {r.text[:200]}")
        return key
    path = storage_root() / key
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(clean)
    return key


def read(key: str) -> bytes:
    """Lit un fichier. Fonction bloquante : l'appeler via asyncio.to_thread."""
    if ".." in key or key.startswith("/"):
        raise StorageError("Chemin invalide.")
    if _backend() == "supabase":
        base, headers = _supabase()
        r = httpx.get(f"{base}/{key}", headers=headers, timeout=30)
        if r.status_code >= 300:
            raise RuntimeError(f"Supabase Storage {r.status_code}")
        return r.content
    path = (storage_root() / key).resolve()
    if storage_root().resolve() not in path.parents:
        raise StorageError("Chemin invalide.")
    return path.read_bytes()
