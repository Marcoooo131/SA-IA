import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
SAMPLES = ROOT / "data" / "samples"


@pytest.fixture(autouse=True)
def isolated_env(tmp_path, monkeypatch):
    """Chaque test dispose de son propre dossier de données, base SQLite et clé de chiffrement."""
    from cryptography.fernet import Fernet

    monkeypatch.setenv("ASC_ENV_FILE", str(tmp_path / "absent.env"))
    monkeypatch.setenv("ASC_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.delenv("ASC_DATABASE_URL", raising=False)
    monkeypatch.setenv("ASC_ENCRYPTION_KEY", Fernet.generate_key().decode())
    monkeypatch.setenv("ASC_LLM_PROVIDER", "none")
    monkeypatch.setenv("ASC_ALLOW_EXTERNAL_API", "false")
    monkeypatch.setenv("ASC_EMBEDDING_BACKEND", "hashing")
    monkeypatch.setenv("ASC_RETENTION_DAYS", "90")
    from sales_coach import config, services
    from sales_coach.security import crypto

    config.get_settings(reload=True)
    crypto.reset_cipher()
    services.reset_kb()
    yield
    services.reset_kb()
    crypto.reset_cipher()


def load_sample(name: str):
    from sales_coach.transcription import load_transcript_file

    p = SAMPLES / name
    return load_transcript_file(p.name, p.read_bytes())
