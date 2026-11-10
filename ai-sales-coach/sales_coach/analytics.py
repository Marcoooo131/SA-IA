"""Indicateurs du tableau de bord (calculés sur les analyses enregistrées)."""
from __future__ import annotations

import pandas as pd

from sales_coach.analysis.catalog import CRITERIA, CRITERIA_MAX, ERRORS


def to_frame(rows: list[dict]) -> pd.DataFrame:
    df = pd.DataFrame(rows)
    if df.empty:
        return df
    df["call_date"] = pd.to_datetime(df["call_date"])
    for key, _, mx in CRITERIA:
        df[f"{key}_pct"] = 100 * df[key] / mx
    return df


def filter_frame(df: pd.DataFrame, agent: str | None = None, start=None, end=None, error_code: str | None = None) -> pd.DataFrame:
    if df.empty:
        return df
    if agent and agent != "Tous":
        df = df[df["agent"] == agent]
    if start is not None:
        df = df[df["call_date"].dt.date >= start]
    if end is not None:
        df = df[df["call_date"].dt.date <= end]
    if error_code and error_code != "Toutes":
        df = df[df["error_codes"].apply(lambda c: error_code in c)]
    return df


def kpis(df: pd.DataFrame) -> dict:
    if df.empty:
        return {"n": 0}
    outcomes = df["outcome"].dropna()
    decided = outcomes[outcomes.isin(["conservé", "résilié"])]
    return {
        "n": int(len(df)),
        "agents": int(df["agent"].nunique()),
        "avg": round(float(df["total_score"].mean()), 1),
        "discovery_pct": round(float(df["decouverte_pct"].mean()), 1) if df["decouverte_pct"].notna().any() else None,
        "objections_pct": round(float(df["objections_pct"].mean()), 1) if df["objections_pct"].notna().any() else None,
        "missed_total": int(df["missed_count"].sum()),
        "missed_avg": round(float(df["missed_count"].mean()), 1),
        "outcomes_known": int(len(outcomes)),
        "retained": int((outcomes == "conservé").sum()),
        "lost": int((outcomes == "résilié").sum()),
        "pending": int((outcomes == "en attente").sum()),
        "retention_rate": round(100 * float((decided == "conservé").mean()), 1) if len(decided) else None,
    }


def weekly_scores(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return df
    w = df.set_index("call_date").resample("W-MON", label="left", closed="left")["total_score"].agg(["mean", "count"]).reset_index()
    return w[w["count"] > 0]


def level_distribution(df: pd.DataFrame) -> pd.DataFrame:
    order = ["Débutant", "En développement", "Confirmé", "Avancé", "Expert"]
    counts = df["level"].value_counts().reindex(order, fill_value=0) if not df.empty else pd.Series(0, index=order)
    return counts.rename_axis("niveau").reset_index(name="appels")


def error_frequency(df: pd.DataFrame, top: int = 10) -> pd.DataFrame:
    if df.empty:
        return pd.DataFrame(columns=["code", "erreur", "appels", "part"])
    counts: dict[str, int] = {}
    for codes in df["error_codes"]:
        for c in set(codes):
            counts[c] = counts.get(c, 0) + 1
    out = pd.DataFrame([{"code": c, "erreur": ERRORS[c].title if c in ERRORS else c, "appels": n, "part": round(100 * n / len(df), 1)}
                        for c, n in counts.items()])
    return out.sort_values("appels", ascending=False).head(top) if not out.empty else out


def per_agent(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return df
    rows = []
    for agent, g in df.groupby("agent"):
        g = g.sort_values("call_date")
        k = min(3, len(g) // 2)
        prog = round(float(g["total_score"].tail(k).mean() - g["total_score"].head(k).mean()), 1) if len(g) >= 4 else None
        outcomes = g["outcome"].dropna()
        decided = outcomes[outcomes.isin(["conservé", "résilié"])]
        rows.append({
            "Commercial": agent, "Appels": len(g), "Note moyenne": round(float(g["total_score"].mean()), 1),
            "Dernière note": round(float(g["total_score"].iloc[-1]), 1), "Progression (pts)": prog,
            "Découverte %": round(float(g["decouverte_pct"].mean()), 0) if g["decouverte_pct"].notna().any() else None,
            "Objections %": round(float(g["objections_pct"].mean()), 0) if g["objections_pct"].notna().any() else None,
            "Occasions manquées / appel": round(float(g["missed_count"].mean()), 1),
            "Rétention réelle %": round(100 * float((decided == "conservé").mean()), 0) if len(decided) else None,
            "Résultats connus": int(len(outcomes)),
        })
    return pd.DataFrame(rows).sort_values("Note moyenne", ascending=False)


__all__ = ["to_frame", "filter_frame", "kpis", "weekly_scores", "level_distribution", "error_frequency", "per_agent", "CRITERIA_MAX"]
