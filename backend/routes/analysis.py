"""Evidence-based deterministic triage and recommendation routes."""

import re
from datetime import datetime, timezone
from typing import Literal
from uuid import UUID

from fastapi import APIRouter
from pydantic import BaseModel

from routes.evidence import EvidenceRecord, evidence_for_incident
from routes.incidents import IncidentRecord, get_incident

router = APIRouter(prefix="/api/incidents", tags=["triage and analysis"])


class RootCauseFinding(BaseModel):
    status: Literal["likely", "undetermined"]
    summary: str
    confidence: Literal["high", "medium", "low"]
    rationale: list[str]
    supporting_evidence_ids: list[UUID]


class RemediationRecommendation(BaseModel):
    action: str
    rationale: str
    risk: Literal["low", "medium", "high"]
    human_approval_required: bool = True


class IncidentAnalysis(BaseModel):
    incident_id: UUID
    analyzed_at: datetime
    triage_summary: str
    severity: str
    evidence_count: int
    evidence_sources: list[str]
    root_cause: RootCauseFinding
    recommendations: list[RemediationRecommendation]
    next_steps: list[str]


def _missing_config_key(evidence: list[EvidenceRecord]) -> tuple[str, UUID] | None:
    for item in evidence:
        if item.source.casefold() != "application log":
            continue
        key = item.details.get("key")
        if isinstance(key, str) and key:
            return key, item.id
        match = re.search(r"(?:KeyError|missing)\s*[:=]?\s*['\"]?([A-Z][A-Z0-9_]+)", item.observation)
        if match:
            return match.group(1), item.id
    return None


def _config_rename(evidence: list[EvidenceRecord]) -> tuple[str, str, UUID] | None:
    for item in evidence:
        if item.source.casefold() != "recent change":
            continue
        previous = item.details.get("previous_key")
        current = item.details.get("current_key")
        if isinstance(previous, str) and isinstance(current, str) and previous and current:
            return previous, current, item.id
    return None


@router.post("/{incident_id}/analyze", response_model=IncidentAnalysis)
def analyze_incident(incident_id: UUID) -> IncidentAnalysis:
    """Triage one incident and explain a likely cause from its collected evidence."""
    incident: IncidentRecord = get_incident(incident_id)
    evidence = evidence_for_incident(incident_id)
    sources = list(dict.fromkeys(item.source for item in evidence))
    health_failures = [
        item
        for item in evidence
        if item.source.casefold() == "health check"
        and any(signal in item.observation.casefold() for signal in ("500", "failed", "unhealthy", "error"))
    ]

    missing_config = _missing_config_key(evidence)
    missing_key = missing_config[0] if missing_config else None
    renamed_key = _config_rename(evidence)
    finding: RootCauseFinding
    recommendations: list[RemediationRecommendation]

    if renamed_key and missing_key == renamed_key[0]:
        previous, current, change_id = renamed_key
        supporting = [missing_config[1]]
        supporting.extend(item.id for item in health_failures)
        supporting.append(change_id)
        confidence: Literal["high", "medium", "low"] = (
            "high" if health_failures else "medium"
        )
        rationale = [
            f"An application log reports the missing setting {missing_key}.",
            f"A recent-change record says {previous} was renamed to {current}.",
        ]
        if health_failures:
            rationale.append("The health-check evidence confirms the service is failing.")
        finding = RootCauseFinding(
            status="likely",
            summary=f"The service expects {previous}, while the updated configuration uses {current}.",
            confidence=confidence,
            rationale=rationale,
            supporting_evidence_ids=list(dict.fromkeys(supporting)),
        )
        recommendations = [
            RemediationRecommendation(
                action=f"Align the service and configuration on one setting name: update the service to read {current}, or restore {previous} in configuration.",
                rationale="This addresses the setting mismatch identified by the application log and change record.",
                risk="medium",
            ),
            RemediationRecommendation(
                action="Add a configuration validation check and a test for the selected setting name.",
                rationale="A startup check and regression test can catch a future mismatch before it causes an outage.",
                risk="low",
            ),
        ]
    else:
        rationale = []
        if health_failures:
            rationale.append("A health-check record shows the service is failing.")
        if missing_key:
            rationale.append(f"An application log references the missing setting {missing_key}.")
        if not renamed_key:
            rationale.append("No recent-change record with a before-and-after setting name was found.")
        if not evidence:
            rationale.append("No evidence has been attached to this incident yet.")
        finding = RootCauseFinding(
            status="undetermined",
            summary="The available evidence does not support a specific root-cause finding yet.",
            confidence="low",
            rationale=rationale or ["The collected evidence does not match a known deterministic rule."],
            supporting_evidence_ids=[item.id for item in health_failures],
        )
        recommendations = [
            RemediationRecommendation(
                action="Collect the failing health-check response, relevant application logs, and the latest change record.",
                rationale="Those signals are needed to connect customer impact to a recent change before recommending a specific patch.",
                risk="low",
            )
        ]

    triage_summary = (
        f"{incident.severity.capitalize()} severity incident for {incident.service}. "
        f"Collected {len(evidence)} evidence item(s); "
        + ("a health-check failure is present." if health_failures else "no health-check failure was identified in the evidence.")
    )
    return IncidentAnalysis(
        incident_id=incident_id,
        analyzed_at=datetime.now(timezone.utc),
        triage_summary=triage_summary,
        severity=incident.severity,
        evidence_count=len(evidence),
        evidence_sources=sources,
        root_cause=finding,
        recommendations=recommendations,
        next_steps=[
            "Review the evidence and recommendation with a teammate.",
            "Require human approval before applying any change.",
            "After an approved patch, run the sandbox health check and record the result.",
        ],
    )
