"""Jeu de démonstration : appels FICTIFS répartis sur 3 commerciaux fictifs et 8 semaines."""
from __future__ import annotations

from datetime import datetime, timedelta

from sales_coach.config import PROJECT_ROOT
from sales_coach.services import run_analysis
from sales_coach.storage import repo
from sales_coach.transcription import load_transcript_file

SAMPLES = PROJECT_ROOT / "data" / "samples"

# (commercial fictif, fichier, semaines avant aujourd'hui, résultat réel fictif)
PLAN = [
    ("Agent 01", "appel_01_budget_acceptation_rapide.txt", 8, "résilié"),
    ("Agent 01", "appel_03_deja_equipe_moyen.txt", 6, "en attente"),
    ("Agent 01", "appel_06_proprietaire_moyen.txt", 4, "résilié"),
    ("Agent 01", "appel_03_deja_equipe_moyen.txt", 2, None),
    ("Agent 01", "appel_02_autre_region_excellent.txt", 1, "conservé"),
    ("Agent 02", "appel_05_etranger_definitif.txt", 7, "résilié"),
    ("Agent 02", "appel_02_autre_region_excellent.txt", 5, "conservé"),
    ("Agent 02", "appel_06_proprietaire_moyen.txt", 3, "conservé"),
    ("Agent 02", "appel_02_autre_region_excellent.txt", 1, "conservé"),
    ("Agent 03", "appel_04_insatisfait_pression.txt", 8, "résilié"),
    ("Agent 03", "appel_06_proprietaire_moyen.txt", 5, None),
    ("Agent 03", "appel_01_budget_acceptation_rapide.txt", 3, "résilié"),
    ("Agent 03", "appel_03_deja_equipe_moyen.txt", 1, "en attente"),
]


def load_demo(now: datetime | None = None) -> int:
    now = now or datetime.now()
    n = 0
    for agent, fname, weeks, outcome in PLAN:
        path = SAMPLES / fname
        t = load_transcript_file(path.name, path.read_bytes())
        res = run_analysis(t, anonymize=True, use_llm=False)
        aid = repo.get_or_create_agent(agent, team="Démo")
        an_id = repo.save_analysis(aid, f"[DÉMO] {fname[10:-4].replace('_', ' ')}", res.transcript, res.report, consent=True, anonymized=True,
                                   created_by="démo", call_date=now - timedelta(weeks=weeks, days=n % 3))
        if outcome:
            rows = [r for r in repo.list_analyses(agent_id=aid) if r["id"] == an_id]
            repo.record_outcome(rows[0]["call_id"], outcome, "résultat fictif (démo)", by="démo")
        n += 1
    return n
