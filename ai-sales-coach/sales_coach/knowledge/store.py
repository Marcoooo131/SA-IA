"""Base de connaissances RAG : import, découpage, indexation vectorielle et recherche avec source.

Trois périmètres distincts (exigence produit) :
- ``general``    : connaissances commerciales générales (méthodes publiées, publications, ressources publiques) ;
- ``entreprise`` : documents métier de l'entreprise (procédures, offres, scripts, conditions) ;
- ``ia``         : recommandations générées par l'IA et validées pour réutilisation.

Seul le périmètre ``entreprise`` peut fonder une affirmation sur les offres, tarifs, conditions ou
procédures. Chaque document conserve source, URL, date et niveau de fiabilité.
"""
from __future__ import annotations

import hashlib
import importlib.util
from dataclasses import dataclass

import numpy as np
from sqlalchemy import func, select

from sales_coach.knowledge.embeddings import get_embedder
from sales_coach.knowledge.loaders import chunk_text, extract_text
from sales_coach.storage.db import KBChunk, KBDocument, session_scope

SCOPES = {
    "general": "Connaissances commerciales générales",
    "entreprise": "Connaissances spécifiques à l'entreprise",
    "ia": "Recommandations générées par l'IA (validées)",
}
RELIABILITY = [
    "Document interne officiel",
    "Document interne (brouillon / non validé)",
    "Publication scientifique évaluée par les pairs",
    "Ouvrage de référence publié",
    "Ressource de formation publique",
    "Pratique professionnelle reconnue (non validée scientifiquement)",
    "Source web non vérifiée",
    "Recommandation IA (à valider)",
]


@dataclass
class Hit:
    document_id: int
    title: str
    scope: str
    source: str
    url: str
    doc_date: str
    reliability: str
    chunk_index: int
    text: str
    score: float

    def citation(self) -> str:
        parts = [self.title, self.source, self.doc_date, self.reliability]
        cit = " — ".join(p for p in parts if p)
        return f"{cit} ({self.url})" if self.url else cit


class KnowledgeBase:
    def __init__(self, backend: str | None = None, model_name: str | None = None, vector_store: str | None = None):
        from sales_coach.config import get_settings

        st = get_settings()
        self.embedder = get_embedder(backend or st.embedding_backend, model_name or st.embedding_model)
        self.vector_store = vector_store or st.vector_store
        self._chroma = None
        if self.vector_store == "chroma":
            if not importlib.util.find_spec("chromadb"):
                raise RuntimeError("ASC_VECTOR_STORE=chroma mais chromadb n'est pas installé (pip install -r requirements-ml.txt).")
            import chromadb  # type: ignore

            client = chromadb.PersistentClient(path=str(st.data_dir / "chroma"))
            self._chroma = client.get_or_create_collection("sales_coach_kb", metadata={"hnsw:space": "cosine"})

    @property
    def backend_name(self) -> str:
        return self.embedder.name

    @property
    def min_score(self) -> float:
        """Seuil de pertinence : les similarités lexicales (hashing) sont structurellement plus basses."""
        return 0.05 if self.backend_name.startswith("hashing") else 0.3

    # ------------------------------------------------------------------ import
    def add_text(self, title: str, text: str, scope: str, *, category: str = "", source: str = "", url: str = "",
                 doc_date: str = "", reliability: str = "", filename: str = "", imported_by: str = "") -> int:
        if scope not in SCOPES:
            raise ValueError(f"Périmètre inconnu : {scope}")
        digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
        chunks = chunk_text(text)
        if not chunks:
            raise ValueError("Document vide ou trop court après extraction.")
        with session_scope() as s:
            existing = s.scalar(select(KBDocument).where(KBDocument.sha256 == digest, KBDocument.scope == scope))
            if existing:
                return existing.id
            doc = KBDocument(title=title[:300], scope=scope, category=category, source=source[:300], url=url[:500], doc_date=doc_date,
                             reliability=reliability, filename=filename[:300], sha256=digest, imported_by=imported_by)
            s.add(doc)
            s.flush()
            vecs = self.embedder.embed(chunks)
            for i, (c, v) in enumerate(zip(chunks, vecs)):
                s.add(KBChunk(document_id=doc.id, chunk_index=i, text=c, embedding=v.astype(np.float32).tobytes(), backend=self.backend_name))
            s.commit()
            if self._chroma is not None:
                self._chroma.add(ids=[f"{doc.id}:{i}" for i in range(len(chunks))], embeddings=[v.tolist() for v in vecs], documents=chunks,
                                 metadatas=[{"document_id": doc.id, "chunk_index": i, "scope": scope} for i in range(len(chunks))])
            return doc.id

    def add_file(self, filename: str, data: bytes, scope: str, **meta) -> int:
        text = extract_text(filename, data)
        meta.setdefault("title", filename)
        title = meta.pop("title")
        return self.add_text(title, text, scope, filename=filename, **meta)

    # ------------------------------------------------------------------ recherche
    def search(self, query: str, scope: str | None = None, k: int = 5) -> list[Hit]:
        qv = self.embedder.embed([query])[0]
        if self._chroma is not None:
            return self._search_chroma(qv, scope, k)
        with session_scope() as s:
            q = select(KBChunk, KBDocument).join(KBDocument, KBDocument.id == KBChunk.document_id).where(KBChunk.backend == self.backend_name)
            if scope:
                q = q.where(KBDocument.scope == scope)
            rows = list(s.execute(q))
        if not rows:
            return []
        mat = np.vstack([np.frombuffer(c.embedding, dtype=np.float32) for c, _ in rows])
        sims = mat @ qv
        order = np.argsort(-sims)[:k]
        return [
            Hit(d.id, d.title, d.scope, d.source, d.url, d.doc_date, d.reliability, c.chunk_index, c.text, float(sims[i]))
            for i in order
            for c, d in [rows[i]]
        ]

    def _search_chroma(self, qv, scope: str | None, k: int) -> list[Hit]:
        res = self._chroma.query(query_embeddings=[qv.tolist()], n_results=k, where={"scope": scope} if scope else None)
        hits = []
        with session_scope() as s:
            for meta, dist, text in zip(res["metadatas"][0], res["distances"][0], res["documents"][0]):
                d = s.get(KBDocument, meta["document_id"])
                if d is not None:
                    hits.append(Hit(d.id, d.title, d.scope, d.source, d.url, d.doc_date, d.reliability, meta["chunk_index"], text, 1.0 - float(dist)))
        return hits

    def context_for(self, query: str, scope: str = "entreprise", k: int = 3, min_score: float | None = None) -> list[str]:
        threshold = self.min_score if min_score is None else min_score
        return [f"[Source : {h.citation()}]\n{h.text}" for h in self.search(query, scope, k) if h.score >= threshold]

    # ------------------------------------------------------------------ gestion
    def list_documents(self, scope: str | None = None) -> list[dict]:
        with session_scope() as s:
            q = select(KBDocument, func.count(KBChunk.id)).outerjoin(KBChunk).group_by(KBDocument.id).order_by(KBDocument.imported_at.desc())
            if scope:
                q = q.where(KBDocument.scope == scope)
            return [
                {"id": d.id, "title": d.title, "scope": d.scope, "category": d.category, "source": d.source, "url": d.url, "date": d.doc_date,
                 "reliability": d.reliability, "chunks": n, "imported_at": d.imported_at, "imported_by": d.imported_by}
                for d, n in s.execute(q)
            ]

    def delete_document(self, doc_id: int) -> None:
        with session_scope() as s:
            d = s.get(KBDocument, doc_id)
            if d:
                n = len(d.chunks)
                s.delete(d)
                s.commit()
                if self._chroma is not None:
                    self._chroma.delete(ids=[f"{doc_id}:{i}" for i in range(n)])

    def stale_chunks(self) -> int:
        with session_scope() as s:
            return s.scalar(select(func.count(KBChunk.id)).where(KBChunk.backend != self.backend_name)) or 0

    def reindex(self) -> int:
        """Recalcule les embeddings avec le moteur courant (après changement de backend)."""
        n = 0
        with session_scope() as s:
            chunks = list(s.scalars(select(KBChunk).where(KBChunk.backend != self.backend_name)))
            for i in range(0, len(chunks), 64):
                batch = chunks[i:i + 64]
                vecs = self.embedder.embed([c.text for c in batch])
                for c, v in zip(batch, vecs):
                    c.embedding = v.astype(np.float32).tobytes()
                    c.backend = self.backend_name
                    n += 1
            s.commit()
        return n
