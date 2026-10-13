"""Business and technical metrics computed from the tracking database."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .models import Call, CallStatus, CrmWrite, Report, Review, WebhookEvent

SUCCESS = {CallStatus.READY, CallStatus.NEEDS_REVIEW, CallStatus.APPROVED, CallStatus.CRM_PENDING,
           CallStatus.CRM_CONFIRMED, CallStatus.COPIED_MANUALLY, CallStatus.REJECTED}
FINISHED = SUCCESS | {CallStatus.FAILED, CallStatus.NO_CONTENT, CallStatus.RECORDING_ABSENT}


def compute_metrics(s: Session, since: datetime | None = None) -> dict:
    q = select(Call)
    if since:
        q = q.where(Call.received_at >= since)
    calls = list(s.scalars(q))
    finished = [c for c in calls if c.status in FINISHED]
    succeeded = [c for c in calls if c.status in SUCCESS]
    durations = [c.processing_ms for c in succeeded if c.processing_ms]
    reports = list(s.scalars(select(Report)))
    first_versions = [r for r in reports if r.version == 1]
    reviews = list(s.scalars(select(Review).where(Review.action.in_(["approve", "edit_approve"]))))
    webhook_dupes = s.scalar(select(func.coalesce(func.sum(WebhookEvent.duplicates), 0))) or 0
    crm_confirmed = s.scalar(select(func.count()).select_from(CrmWrite).where(CrmWrite.status == "confirmed")) or 0

    def ratio(a: int, b: int) -> float | None:
        return round(a / b, 4) if b else None

    by_status: dict[str, int] = {}
    for c in calls:
        by_status[c.status.value] = by_status.get(c.status.value, 0) + 1

    return {
        "calls_received": len(calls),
        "calls_by_status": by_status,
        "success_rate": ratio(len(succeeded), len(finished)),
        "avg_processing_seconds": round(sum(durations) / len(durations) / 1000, 1) if durations else None,
        "avg_cost_usd_per_call": round(sum(c.cost_usd or 0 for c in succeeded) / len(succeeded), 5) if succeeded else None,
        "human_review_rate": ratio(sum(1 for r in first_versions if r.status != "ready" or r.reviews), len(first_versions)),
        "correction_rate": ratio(sum(1 for r in reviews if r.edited), len(reviews)),
        "avg_edit_ratio": round(sum(r.edit_ratio for r in reviews) / len(reviews), 3) if reviews else None,
        "duplicates_avoided": int(webhook_dupes),
        "crm_writes_confirmed": int(crm_confirmed),
    }


def prometheus_text(m: dict) -> str:
    lines = []

    def g(name: str, value, help_: str, labels: str = "") -> None:
        if value is None:
            return
        lines.append(f"# HELP phonecall_{name} {help_}")
        lines.append(f"# TYPE phonecall_{name} gauge")
        lines.append(f"phonecall_{name}{labels} {value}")

    g("calls_received", m["calls_received"], "Calls received")
    for status, n in sorted(m["calls_by_status"].items()):
        lines.append(f'phonecall_calls_by_status{{status="{status}"}} {n}')
    g("success_rate", m["success_rate"], "Share of finished calls with a generated report")
    g("avg_processing_seconds", m["avg_processing_seconds"], "Average processing time")
    g("avg_cost_usd_per_call", m["avg_cost_usd_per_call"], "Average provider cost per call (estimate)")
    g("human_review_rate", m["human_review_rate"], "Share of reports sent to human review")
    g("correction_rate", m["correction_rate"], "Share of approved reports edited by a human")
    g("duplicates_avoided", m["duplicates_avoided"], "Duplicate webhooks ignored")
    g("crm_writes_confirmed", m["crm_writes_confirmed"], "CRM writes verified")
    return "\n".join(lines) + "\n"
