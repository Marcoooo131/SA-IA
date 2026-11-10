"""API REST (FastAPI) — base pour une future intégration (CRM, téléphonie, outil interne).

Lancement : ``uvicorn sales_coach.api.main:app --port 8000``
Authentification : en-tête ``X-API-Token`` égal à ``ASC_API_TOKEN`` (l'API refuse tout appel si le
jeton n'est pas configuré). Rien n'est enregistré par /analyze sauf si ``save=true``.
"""
from __future__ import annotations

import hmac
from datetime import datetime

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from sales_coach import __version__
from sales_coach.coaching.engine import build_profile
from sales_coach.config import get_settings
from sales_coach.security.auth import audit
from sales_coach.services import get_kb, run_analysis
from sales_coach.storage import repo
from sales_coach.training import simulator as sim
from sales_coach.transcription import parse_text

app = FastAPI(title="AI Sales Coach API", version=__version__, description="Coach IA de rétention commerciale (déménagement).")


def require_token(x_api_token: str = Header(default="")) -> str:
    expected = get_settings().api_token
    if not expected:
        raise HTTPException(503, "API désactivée : définissez ASC_API_TOKEN.")
    if not hmac.compare_digest(x_api_token, expected):
        raise HTTPException(401, "Jeton invalide.")
    return "api"


class AnalyzeIn(BaseModel):
    transcript: str = Field(..., description="Une réplique par ligne : « COMMERCIAL : … » / « CLIENT : … »")
    agent: str | None = None
    title: str = "Appel (API)"
    anonymize: bool = True
    use_llm: bool = False
    authorize_external: bool = False
    save: bool = False
    consent: bool = False
    call_date: datetime | None = None


class TrainingIn(BaseModel):
    state: dict | None = None
    persona: str = "indecis"
    difficulty: int = 1
    message: str | None = None


@app.get("/health")
def health() -> dict:
    s = get_settings()
    return {"status": "ok", "version": __version__, "llm_provider": s.llm_provider, "external_api_allowed": s.allow_external_api}


@app.post("/analyze")
def analyze_call(body: AnalyzeIn, who: str = Depends(require_token)) -> dict:
    t = parse_text(body.transcript)
    if any(u.speaker == "INCONNU" for u in t.utterances):
        raise HTTPException(422, "Locuteurs non reconnus : utilisez les étiquettes COMMERCIAL / CLIENT.")
    try:
        res = run_analysis(t, anonymize=body.anonymize, use_llm=body.use_llm, authorize_external=body.authorize_external)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    out = {"report": res.report.to_dict(), "anonymized": res.anonymized}
    if body.save:
        if not body.agent:
            raise HTTPException(422, "« agent » requis pour enregistrer.")
        if not body.consent:
            raise HTTPException(422, "« consent » doit être vrai pour enregistrer un appel réel.")
        aid = repo.get_or_create_agent(body.agent)
        out["analysis_id"] = repo.save_analysis(aid, body.title, res.transcript, res.report, consent=True, anonymized=res.anonymized,
                                                created_by=who, call_date=body.call_date)
    audit(who, "API analyse", target=body.title, detail=f"save={body.save}")
    return out


@app.get("/agents")
def agents(who: str = Depends(require_token)) -> list[dict]:
    return [{"id": a.id, "name": a.name, "team": a.team} for a in repo.list_agents()]


@app.get("/agents/{agent_id}/profile")
def profile(agent_id: int, who: str = Depends(require_token)) -> dict:
    a = repo.get_agent(agent_id)
    if a is None:
        raise HTTPException(404, "Commercial introuvable.")
    p = build_profile(a.id, a.name, repo.list_analyses(agent_id=a.id), repo.list_training(agent_id=a.id), a.objectives or "")
    from dataclasses import asdict

    return asdict(p)


@app.get("/kb/search")
def kb_search(q: str, scope: str | None = None, k: int = 5, who: str = Depends(require_token)) -> list[dict]:
    return [{"title": h.title, "scope": h.scope, "citation": h.citation(), "score": round(h.score, 3), "text": h.text} for h in get_kb().search(q, scope, k)]


@app.post("/training/turn")
def training_turn(body: TrainingIn, who: str = Depends(require_token)) -> dict:
    """Entraînement sans état côté serveur : le client renvoie l'état reçu à chaque tour."""
    if body.state is None:
        st = sim.start(body.persona, body.difficulty)
    else:
        st = sim.SimState.from_dict(body.state)
        if body.message:
            st = sim.reply(st, body.message)
    return {"state": st.to_dict(), "client": st.turns[-1]["text"], "finished": st.finished, "outcome": st.outcome}
