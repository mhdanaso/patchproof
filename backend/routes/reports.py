"""Unified incident report assembled from the in-memory workflow records."""

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter
from pydantic import BaseModel

from routes.analysis import IncidentAnalysis, latest_analysis_for_incident
from routes.approvals import ApprovalRecord, approval_records_for_incident
from routes.evidence import EvidenceRecord, evidence_for_incident
from routes.incidents import IncidentRecord, get_incident
from routes.verification import VerificationRecord, verification_records_for_incident

router = APIRouter(prefix="/api/incidents", tags=["reports"])


class TimelineEvent(BaseModel):
    occurred_at: datetime
    kind: str
    summary: str
    reference_id: UUID | None = None


class IncidentReport(BaseModel):
    generated_at: datetime
    incident: IncidentRecord
    evidence: list[EvidenceRecord]
    analysis: IncidentAnalysis | None
    approvals: list[ApprovalRecord]
    verifications: list[VerificationRecord]
    timeline: list[TimelineEvent]


@router.get("/{incident_id}/report", response_model=IncidentReport)
def get_incident_report(incident_id: UUID) -> IncidentReport:
    """Assemble an incident's evidence, analysis, decisions, and checks."""
    incident = get_incident(incident_id)
    evidence = evidence_for_incident(incident_id)
    analysis = latest_analysis_for_incident(incident_id)
    approvals = approval_records_for_incident(incident_id)
    verifications = verification_records_for_incident(incident_id)

    events = [
        TimelineEvent(
            occurred_at=incident.created_at,
            kind="incident_created",
            summary=f"Incident reported: {incident.title}",
            reference_id=incident.id,
        )
    ]
    events.extend(
        TimelineEvent(
            occurred_at=item.collected_at,
            kind="evidence_collected",
            summary=f"{item.source}: {item.observation}",
            reference_id=item.id,
        )
        for item in evidence
    )
    if analysis:
        events.append(
            TimelineEvent(
                occurred_at=analysis.analyzed_at,
                kind="analysis_completed",
                summary=analysis.root_cause.summary,
                reference_id=None,
            )
        )
    events.extend(
        TimelineEvent(
            occurred_at=item.recorded_at,
            kind="approval_recorded",
            summary=f"{item.decision.capitalize()} by {item.approver}"
            + (f": {item.note}" if item.note else ""),
            reference_id=item.id,
        )
        for item in approvals
    )
    events.extend(
        TimelineEvent(
            occurred_at=item.checked_at,
            kind="verification_completed",
            summary=f"Sandbox verification {item.status}: {item.summary}",
            reference_id=item.id,
        )
        for item in verifications
    )
    events.sort(key=lambda event: event.occurred_at)
    return IncidentReport(
        generated_at=datetime.now(timezone.utc),
        incident=incident,
        evidence=evidence,
        analysis=analysis,
        approvals=approvals,
        verifications=verifications,
        timeline=events,
    )
