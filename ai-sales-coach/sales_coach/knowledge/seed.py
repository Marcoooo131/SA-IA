"""Chargement de la base de connaissances générale fournie avec l'application (data/knowledge_seed).

Ces fiches sont des SYNTHÈSES rédigées pour l'outil à partir de références publiées. Chaque fiche
indique sa référence bibliographique et son niveau de fiabilité ; les méthodes de formation
commerciale (SONCAS, CAP, …) sont explicitement signalées comme « non validées scientifiquement ».
Aucune fiche ne contient de tarif, d'offre ni de condition propre à une entreprise.
"""
from __future__ import annotations

from pathlib import Path

from sales_coach.config import PROJECT_ROOT

SEED_DIR = PROJECT_ROOT / "data" / "knowledge_seed"


def parse_front_matter(text: str) -> tuple[dict, str]:
    if not text.startswith("---"):
        return {}, text
    _, fm, body = text.split("---", 2)
    meta = {}
    for line in fm.strip().splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            meta[k.strip()] = v.strip()
    return meta, body.strip()


def load_seed(kb, seed_dir: Path = SEED_DIR) -> int:
    n = 0
    for path in sorted(seed_dir.glob("*.md")):
        meta, body = parse_front_matter(path.read_text(encoding="utf-8"))
        kb.add_text(
            meta.get("title", path.stem), body, "general", category=meta.get("category", ""), source=meta.get("source", ""),
            url=meta.get("url", ""), doc_date=meta.get("date", ""), reliability=meta.get("reliability", ""), filename=path.name,
            imported_by="système (fiches fournies)",
        )
        n += 1
    return n
