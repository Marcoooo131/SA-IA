"""Business configuration of the note (``business.yaml``): categories, keywords, format.

Shared by every note mode. The file is an EXAMPLE until validated by the business.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path

from ..config import Settings, install_dir

log = logging.getLogger(__name__)

# Example file of the sources (phonecall-agent/config), used when running without the package
SOURCES_EXAMPLE = Path(__file__).resolve().parents[3] / "phonecall-agent" / "config" / "business.example.yaml"


def business_config_path(settings: Settings) -> Path | None:
    """Explicit setting, then ``business.yaml`` next to the .exe, then the example of the sources."""
    candidates: list[Path] = []
    if settings.business_config:
        candidates.append(settings.business_config)
    if (d := install_dir()) is not None:
        candidates.append(d / "business.yaml")
    candidates.append(SOURCES_EXAMPLE)
    return next((p for p in candidates if p.is_file()), None)


@dataclass
class Category:
    key: str
    label: str
    keywords: list[str] = field(default_factory=list)


def load_categories(settings: Settings) -> list[Category]:
    path = business_config_path(settings)
    if path is None:
        log.warning("no business.yaml: no category detection")
        return []
    import yaml

    data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    return [Category(str(c["key"]), str(c.get("label") or c["key"]), [str(k) for k in c.get("keywords") or []])
            for c in data.get("categories") or [] if c.get("key")]
