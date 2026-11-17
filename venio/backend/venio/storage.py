"""Stockage des fichiers déposés. Implémentation disque locale ; interface prête pour un stockage S3."""
import io
import os
from pathlib import Path
from uuid import uuid4

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


def save(tenant_id: str, data: bytes, mime: str) -> str:
    if mime not in ALLOWED:
        raise StorageError("Format accepté : JPEG, PNG, WebP ou PDF.")
    if len(data) > MAX_BYTES:
        raise StorageError("Fichier trop volumineux (10 Mo maximum).")
    clean = sanitize(data, mime)
    key = f"{tenant_id}/{uuid4()}{ALLOWED[mime]}"
    path = storage_root() / key
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(clean)
    return key


def read(key: str) -> bytes:
    path = (storage_root() / key).resolve()
    if storage_root().resolve() not in path.parents:
        raise StorageError("Chemin invalide.")
    return path.read_bytes()
