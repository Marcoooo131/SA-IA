"""Opérations de sauvegarde et de lecture des appels, analyses, résultats et purge."""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta
from pathlib import Path

from sqlalchemy import delete, select

from sales_coach.config import get_settings
from sales_coach.core.models import AnalysisReport, Transcript
from sales_coach.security.crypto import decrypt_bytes, decrypt_text, encrypt_bytes, encrypt_text
from sales_coach.storage.db import Agent, Analysis, Call, Outcome, TrainingSession, session_scope, utcnow

OUTCOMES = ["conservé", "résilié", "en attente"]


def get_or_create_agent(name: str, team: str = "") -> int:
    name = name.strip()
    if not name:
        raise ValueError("Nom d'agent vide.")
    with session_scope() as s:
        a = s.scalar(select(Agent).where(Agent.name == name))
        if a is None:
            a = Agent(name=name, team=team)
            s.add(a)
            s.commit()
        return a.id


def list_agents(active_only: bool = True) -> list[Agent]:
    with session_scope() as s:
        q = select(Agent).order_by(Agent.name)
        if active_only:
            q = q.where(Agent.active.is_(True))
        return list(s.scalars(q))


def get_agent(agent_id: int) -> Agent | None:
    with session_scope() as s:
        return s.get(Agent, agent_id)


def set_agent_objectives(agent_id: int, objectives: str) -> None:
    with session_scope() as s:
        a = s.get(Agent, agent_id)
        if a:
            a.objectives = objectives
            s.commit()


def _store_audio(data: bytes, ext: str) -> str:
    settings = get_settings()
    settings.audio_dir.mkdir(parents=True, exist_ok=True)
    path = settings.audio_dir / f"{uuid.uuid4().hex}{ext}.enc"
    path.write_bytes(encrypt_bytes(data))
    return str(path)


def load_audio(path: str) -> bytes:
    return decrypt_bytes(Path(path).read_bytes())


def save_analysis(
    agent_id: int,
    title: str,
    transcript: Transcript,
    report: AnalysisReport,
    *,
    consent: bool,
    anonymized: bool,
    created_by: str = "",
    call_date: datetime | None = None,
    audio: tuple[bytes, str] | None = None,
    is_training: bool = False,
    keep_audio: bool = False,
) -> int:
    if not consent and not is_training:
        raise PermissionError("Le consentement / la base légale doit être confirmé avant d'enregistrer un appel réel.")
    settings = get_settings()
    call_date = call_date or utcnow()
    audio_path = _store_audio(*audio) if (audio and keep_audio) else None
    scores = {c.key: (c.score if c.evaluated else None) for c in report.criteria}
    with session_scope() as s:
        call = Call(
            agent_id=agent_id, title=title[:200], source="entrainement" if is_training else transcript.source,
            call_date=call_date, transcript_enc=encrypt_text(json.dumps(transcript.to_dict(), ensure_ascii=False)),
            audio_path=audio_path, anonymized=anonymized, consent=consent, created_by=created_by,
            purge_after=utcnow() + timedelta(days=settings.retention_days) if settings.retention_days > 0 else None,
        )
        s.add(call)
        s.flush()
        an = Analysis(
            call_id=call.id, agent_id=agent_id, call_date=call_date, total_score=report.total_score, level=report.level,
            retention_potential=report.retention_potential, engine=report.engine[:200], situations="|".join(report.situations),
            error_codes=",".join(f.code for f in report.findings), missed_count=len(report.missed_opportunities),
            s_contact=scores.get("contact"), s_decouverte=scores.get("decouverte"), s_raisons=scores.get("raisons"),
            s_argumentation=scores.get("argumentation"), s_objections=scores.get("objections"),
            s_proposition=scores.get("proposition"), s_conclusion=scores.get("conclusion"), is_training=is_training,
            report_enc=encrypt_text(json.dumps(report.to_dict(), ensure_ascii=False)),
        )
        s.add(an)
        s.commit()
        return an.id


def list_analyses(agent_id: int | None = None, include_training: bool = False, since: datetime | None = None, until: datetime | None = None) -> list[dict]:
    with session_scope() as s:
        q = select(Analysis, Agent.name, Call.title, Call.purged, Outcome.result).join(Agent, Agent.id == Analysis.agent_id).join(
            Call, Call.id == Analysis.call_id).outerjoin(Outcome, Outcome.call_id == Analysis.call_id)
        if agent_id is not None:
            q = q.where(Analysis.agent_id == agent_id)
        if not include_training:
            q = q.where(Analysis.is_training.is_(False))
        if since is not None:
            q = q.where(Analysis.call_date >= since)
        if until is not None:
            q = q.where(Analysis.call_date <= until)
        rows = []
        for an, agent_name, title, purged, outcome in s.execute(q.order_by(Analysis.call_date)):
            rows.append({
                "id": an.id, "call_id": an.call_id, "agent_id": an.agent_id, "agent": agent_name, "title": title,
                "call_date": an.call_date, "created_at": an.created_at, "total_score": an.total_score, "level": an.level,
                "retention_potential": an.retention_potential, "engine": an.engine,
                "situations": [x for x in an.situations.split("|") if x], "error_codes": [x for x in an.error_codes.split(",") if x],
                "missed_count": an.missed_count, "is_training": an.is_training, "purged": purged, "outcome": outcome,
                "contact": an.s_contact, "decouverte": an.s_decouverte, "raisons": an.s_raisons, "argumentation": an.s_argumentation,
                "objections": an.s_objections, "proposition": an.s_proposition, "conclusion": an.s_conclusion,
            })
        return rows


def load_analysis(analysis_id: int) -> tuple[AnalysisReport | None, Transcript | None, dict]:
    with session_scope() as s:
        an = s.get(Analysis, analysis_id)
        if an is None:
            return None, None, {}
        call = s.get(Call, an.call_id)
        meta = {"agent_id": an.agent_id, "call_id": an.call_id, "title": call.title, "purged": call.purged, "call_date": an.call_date,
                "anonymized": call.anonymized, "has_audio": bool(call.audio_path)}
        report = AnalysisReport.from_dict(json.loads(decrypt_text(an.report_enc))) if an.report_enc else None
        transcript = Transcript.from_dict(json.loads(decrypt_text(call.transcript_enc))) if call.transcript_enc else None
        return report, transcript, meta


def delete_call(call_id: int) -> None:
    with session_scope() as s:
        call = s.get(Call, call_id)
        if call is None:
            return
        if call.audio_path:
            Path(call.audio_path).unlink(missing_ok=True)
        s.execute(delete(Outcome).where(Outcome.call_id == call_id))
        for an in s.scalars(select(Analysis).where(Analysis.call_id == call_id)):
            s.execute(TrainingSession.__table__.update().where(TrainingSession.analysis_id == an.id).values(analysis_id=None))
            s.delete(an)
        s.delete(call)
        s.commit()


def record_outcome(call_id: int, result: str, note: str = "", by: str = "") -> None:
    if result not in OUTCOMES:
        raise ValueError(f"Résultat inconnu : {result}")
    with session_scope() as s:
        call = s.get(Call, call_id)
        if call is None:
            raise ValueError("Appel introuvable.")
        o = s.scalar(select(Outcome).where(Outcome.call_id == call_id))
        if o is None:
            o = Outcome(call_id=call_id, agent_id=call.agent_id, result=result, note=note, recorded_by=by)
            s.add(o)
        else:
            o.result, o.note, o.recorded_by, o.recorded_at = result, note, by, utcnow()
        s.commit()


def purge_expired(now: datetime | None = None) -> int:
    """Supprime transcriptions, rapports détaillés (citations) et audio des appels expirés.

    Les notes chiffrées par critère et les codes d'erreur sont conservés (statistiques non nominatives
    sur le contenu des appels), ce qui préserve le suivi de progression.
    """
    now = now or utcnow()
    count = 0
    with session_scope() as s:
        for call in s.scalars(select(Call).where(Call.purge_after.is_not(None), Call.purge_after <= now, Call.purged.is_(False))):
            if call.audio_path:
                Path(call.audio_path).unlink(missing_ok=True)
                call.audio_path = None
            call.transcript_enc = ""
            call.purged = True
            for an in s.scalars(select(Analysis).where(Analysis.call_id == call.id)):
                an.report_enc = ""
            count += 1
        s.commit()
    return count


def save_training(agent_id: int, persona: str, difficulty: int, engine: str, score: float | None, outcome: str, analysis_id: int | None) -> int:
    with session_scope() as s:
        ts = TrainingSession(agent_id=agent_id, persona=persona, difficulty=difficulty, engine=engine, score=score, outcome=outcome, analysis_id=analysis_id)
        s.add(ts)
        s.commit()
        return ts.id


def list_training(agent_id: int | None = None) -> list[dict]:
    with session_scope() as s:
        q = select(TrainingSession, Agent.name).join(Agent, Agent.id == TrainingSession.agent_id)
        if agent_id is not None:
            q = q.where(TrainingSession.agent_id == agent_id)
        return [
            {"id": t.id, "agent_id": t.agent_id, "agent": name, "persona": t.persona, "difficulty": t.difficulty, "engine": t.engine,
             "score": t.score, "outcome": t.outcome, "analysis_id": t.analysis_id, "created_at": t.created_at}
            for t, name in s.execute(q.order_by(TrainingSession.created_at))
        ]
