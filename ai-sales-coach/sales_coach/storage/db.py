"""Persistance (SQLAlchemy) : SQLite en local, PostgreSQL en multi-utilisateurs (ASC_DATABASE_URL).

Les contenus sensibles (transcriptions, rapports contenant des citations) sont chiffrés au repos.
Les colonnes numériques (notes, critères) restent en clair pour le tableau de bord.
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    LargeBinary,
    String,
    Text,
    create_engine,
    event,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, sessionmaker


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(80), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20))  # admin | manager | agent
    agent_id: Mapped[int | None] = mapped_column(ForeignKey("agents.id"), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Agent(Base):
    __tablename__ = "agents"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True)
    team: Mapped[str] = mapped_column(String(120), default="")
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    objectives: Mapped[str] = mapped_column(Text, default="")  # objectifs fixés par le manager (texte libre)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    analyses: Mapped[list["Analysis"]] = relationship(back_populates="agent")


class Call(Base):
    __tablename__ = "calls"
    id: Mapped[int] = mapped_column(primary_key=True)
    agent_id: Mapped[int] = mapped_column(ForeignKey("agents.id"))
    title: Mapped[str] = mapped_column(String(200))
    source: Mapped[str] = mapped_column(String(20))  # texte | docx | audio | entrainement
    call_date: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    transcript_enc: Mapped[str] = mapped_column(Text)  # JSON chiffré
    audio_path: Mapped[str | None] = mapped_column(String(500), nullable=True)  # fichier chiffré
    anonymized: Mapped[bool] = mapped_column(Boolean, default=False)
    consent: Mapped[bool] = mapped_column(Boolean, default=False)
    purge_after: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    purged: Mapped[bool] = mapped_column(Boolean, default=False)
    created_by: Mapped[str] = mapped_column(String(80), default="")


class Analysis(Base):
    __tablename__ = "analyses"
    id: Mapped[int] = mapped_column(primary_key=True)
    call_id: Mapped[int] = mapped_column(ForeignKey("calls.id"))
    agent_id: Mapped[int] = mapped_column(ForeignKey("agents.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    call_date: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    total_score: Mapped[float] = mapped_column(Float)
    level: Mapped[str] = mapped_column(String(40))
    retention_potential: Mapped[str] = mapped_column(String(20))
    engine: Mapped[str] = mapped_column(String(200))
    situations: Mapped[str] = mapped_column(Text, default="")  # séparées par « | »
    error_codes: Mapped[str] = mapped_column(Text, default="")  # séparés par « , » (avec répétitions)
    missed_count: Mapped[int] = mapped_column(Integer, default=0)
    s_contact: Mapped[float | None] = mapped_column(Float, nullable=True)
    s_decouverte: Mapped[float | None] = mapped_column(Float, nullable=True)
    s_raisons: Mapped[float | None] = mapped_column(Float, nullable=True)
    s_argumentation: Mapped[float | None] = mapped_column(Float, nullable=True)
    s_objections: Mapped[float | None] = mapped_column(Float, nullable=True)
    s_proposition: Mapped[float | None] = mapped_column(Float, nullable=True)
    s_conclusion: Mapped[float | None] = mapped_column(Float, nullable=True)
    is_training: Mapped[bool] = mapped_column(Boolean, default=False)
    report_enc: Mapped[str] = mapped_column(Text)  # JSON chiffré (contient des citations)
    agent: Mapped[Agent] = relationship(back_populates="analyses")


class Outcome(Base):
    """Résultat commercial RÉEL (distinct de la note de qualité)."""

    __tablename__ = "outcomes"
    id: Mapped[int] = mapped_column(primary_key=True)
    call_id: Mapped[int] = mapped_column(ForeignKey("calls.id"), unique=True)
    agent_id: Mapped[int] = mapped_column(ForeignKey("agents.id"))
    result: Mapped[str] = mapped_column(String(30))  # conservé | résilié | en attente
    note: Mapped[str] = mapped_column(Text, default="")
    recorded_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    recorded_by: Mapped[str] = mapped_column(String(80), default="")


class TrainingSession(Base):
    __tablename__ = "training_sessions"
    id: Mapped[int] = mapped_column(primary_key=True)
    agent_id: Mapped[int] = mapped_column(ForeignKey("agents.id"))
    persona: Mapped[str] = mapped_column(String(40))
    difficulty: Mapped[int] = mapped_column(Integer)
    engine: Mapped[str] = mapped_column(String(200), default="scénario")
    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    outcome: Mapped[str] = mapped_column(String(40), default="")
    analysis_id: Mapped[int | None] = mapped_column(ForeignKey("analyses.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class KBDocument(Base):
    __tablename__ = "kb_documents"
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(300))
    scope: Mapped[str] = mapped_column(String(20))  # general | entreprise | ia
    category: Mapped[str] = mapped_column(String(80), default="")
    source: Mapped[str] = mapped_column(String(300), default="")
    url: Mapped[str] = mapped_column(String(500), default="")
    doc_date: Mapped[str] = mapped_column(String(40), default="")
    reliability: Mapped[str] = mapped_column(String(120), default="")
    filename: Mapped[str] = mapped_column(String(300), default="")
    sha256: Mapped[str] = mapped_column(String(64), default="")
    imported_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    imported_by: Mapped[str] = mapped_column(String(80), default="")
    chunks: Mapped[list["KBChunk"]] = relationship(back_populates="document", cascade="all, delete-orphan")


class KBChunk(Base):
    __tablename__ = "kb_chunks"
    id: Mapped[int] = mapped_column(primary_key=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("kb_documents.id", ondelete="CASCADE"))
    chunk_index: Mapped[int] = mapped_column(Integer)
    text: Mapped[str] = mapped_column(Text)
    embedding: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    backend: Mapped[str] = mapped_column(String(120), default="")
    document: Mapped[KBDocument] = relationship(back_populates="chunks")


class AuditLog(Base):
    __tablename__ = "audit_log"
    id: Mapped[int] = mapped_column(primary_key=True)
    ts: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    username: Mapped[str] = mapped_column(String(80))
    action: Mapped[str] = mapped_column(String(80))
    target: Mapped[str] = mapped_column(String(200), default="")
    detail: Mapped[str] = mapped_column(Text, default="")


_engines: dict[str, object] = {}
_sessions: dict[str, sessionmaker] = {}


def get_sessionmaker(url: str | None = None) -> sessionmaker:
    if url is None:
        from sales_coach.config import get_settings

        url = get_settings().database_url
    if url not in _sessions:
        kwargs = {"future": True}
        if url.startswith("sqlite"):
            kwargs["connect_args"] = {"check_same_thread": False}
        engine = create_engine(url, **kwargs)
        if url.startswith("sqlite"):
            @event.listens_for(engine, "connect")
            def _fk(dbapi_conn, _):  # active les clés étrangères SQLite
                dbapi_conn.execute("PRAGMA foreign_keys=ON")
        Base.metadata.create_all(engine)
        _engines[url] = engine
        _sessions[url] = sessionmaker(bind=engine, expire_on_commit=False)
    return _sessions[url]


def session_scope(url: str | None = None):
    return get_sessionmaker(url)()
