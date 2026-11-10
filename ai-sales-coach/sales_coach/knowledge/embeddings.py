"""Embeddings pour la recherche documentaire.

- ``sentence_transformers`` (recommandé) : modèle multilingue local, recherche sémantique.
  Nécessite ``pip install -r requirements-ml.txt`` (~500 Mo avec PyTorch CPU) et un premier
  téléchargement du modèle (ensuite hors ligne).
- ``hashing`` (repli, toujours disponible) : vecteurs lexicaux (mots + bigrammes, sans accents).
  Rapide et sans dépendance, mais lexical : il retrouve les documents qui partagent les mots de la
  requête, pas les synonymes.
"""
from __future__ import annotations

import hashlib
import importlib.util
import math
import re
import unicodedata

import numpy as np

_STOP = set(
    "le la les un une des de du d l et a au aux en dans pour par sur avec que qui quoi ce cet cette ces mon ma mes son sa ses notre nos votre vos leur leurs "
    "je tu il elle on nous vous ils elles me te se y ne pas plus est sont etre ai as a avons avez ont ou donc or ni car si the of and to in is for".split()
)


def _fold(text: str) -> str:
    text = unicodedata.normalize("NFD", text.lower().replace("’", "'"))
    return "".join(c for c in text if unicodedata.category(c) != "Mn")


def _stem(w: str) -> str:
    for suf in ("ements", "ement", "ations", "ation", "euses", "euse", "eurs", "eur", "ees", "ee", "es", "s", "e"):
        if len(w) > len(suf) + 3 and w.endswith(suf):
            return w[: -len(suf)]
    return w


class HashingEmbedder:
    name = "hashing-v1"
    dim = 4096

    def _features(self, text: str) -> list[str]:
        toks = [_stem(t) for t in re.findall(r"[a-z0-9]+", _fold(text)) if t not in _STOP and len(t) > 1]
        return toks + [f"{a}_{b}" for a, b in zip(toks, toks[1:])]

    def embed(self, texts: list[str]) -> np.ndarray:
        out = np.zeros((len(texts), self.dim), dtype=np.float32)
        for i, t in enumerate(texts):
            counts: dict[int, float] = {}
            for f in self._features(t):
                h = int.from_bytes(hashlib.blake2b(f.encode(), digest_size=8).digest(), "little")
                idx = h % self.dim
                sign = 1.0 if (h >> 63) & 1 else -1.0
                counts[idx] = counts.get(idx, 0.0) + sign
            for idx, v in counts.items():
                out[i, idx] = math.copysign(1 + math.log(abs(v)), v) if v else 0.0
            n = np.linalg.norm(out[i])
            if n:
                out[i] /= n
        return out


class SentenceTransformerEmbedder:
    def __init__(self, model_name: str):
        from sentence_transformers import SentenceTransformer  # type: ignore

        self.model = SentenceTransformer(model_name)
        self.name = f"st:{model_name}"

    def embed(self, texts: list[str]) -> np.ndarray:
        return np.asarray(self.model.encode(texts, normalize_embeddings=True, show_progress_bar=False), dtype=np.float32)


_cache: dict[str, object] = {}


def get_embedder(backend: str = "auto", model_name: str = ""):
    key = f"{backend}:{model_name}"
    if key in _cache:
        return _cache[key]
    emb = None
    if backend in {"auto", "sentence_transformers"} and importlib.util.find_spec("sentence_transformers"):
        try:
            emb = SentenceTransformerEmbedder(model_name)
        except Exception:
            if backend == "sentence_transformers":
                raise
    if emb is None:
        if backend == "sentence_transformers":
            raise RuntimeError("sentence-transformers n'est pas installé (pip install -r requirements-ml.txt).")
        emb = HashingEmbedder()
    _cache[key] = emb
    return emb
