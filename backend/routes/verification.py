"""Deterministic sandbox checks for proposed checkout configuration fixes."""

from datetime import datetime, timezone
from threading import Lock
from typing import Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from routes.approvals import approval_records_for_incident
from routes.incidents import get_incident, incident_exists

router = APIRouter(prefix="/api/incidents/{incident_id}", tags=["verification"])


class VerificationRequest(BaseModel):
    application_setting_name: str = Field(min_length=1, max_length=100)
    configured_setting_names: list[str] = Field(max_length=30)
    timeout_value: float


class ManualServiceCheckRequest(BaseModel):
    check_name: str = Field(min_length=1, max_length=120)
    outcome: Literal["passed", "failed"]
    note: str = Field(default="", max_length=1000)


class VerificationCheck(BaseModel):
    name: str
    passed: bool
    details: str


class VerificationRecord(BaseModel):
    id: UUID
    incident_id: UUID
    status: Literal["passed", "failed"]
    checked_at: datetime
    kind: Literal["sandbox", "manual"] = "sandbox"
    application_setting_name: str | None = None
    check_name: str | None = None
    note: str = ""
    checks: list[VerificationCheck]
    summary: str


_verification_by_incident: dict[UUID, list[VerificationRecord]] = {}
_verification_lock = Lock()


def verification_records_for_incident(incident_id: UUID) -> list[VerificationRecord]:
    with _verification_lock:
        return list(_verification_by_incident.get(incident_id, []))


@router.post("/verify", response_model=VerificationRecord, status_code=status.HTTP_201_CREATED)
def verify_proposed_fix(incident_id: UUID, payload: VerificationRequest) -> VerificationRecord:
    incident = get_incident(incident_id)
    if incident.source != "seeded-demo":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Automated verification is currently available for the seeded checkout demo only.",
        )
    approvals = approval_records_for_incident(incident_id)
    if not approvals or approvals[-1].decision != "approved":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Record an approved human review before running verification.",
        )

    allowed_names = {"PAYMENT_TIMEOUT", "PAYMENT_TIMEOUT_MS"}
    configured_names = set(payload.configured_setting_names)
    checks = [
        VerificationCheck(
            name="supported_setting_name",
            passed=payload.application_setting_name in allowed_names,
            details="The application setting is one of the two names supported by the demo workflow.",
        ),
        VerificationCheck(
            name="setting_configured",
            passed=payload.application_setting_name in configured_names,
            details=(
                "The selected application setting is present in the proposed configuration."
                if payload.application_setting_name in configured_names
                else "The selected application setting is absent from the proposed configuration."
            ),
        ),
        VerificationCheck(
            name="positive_timeout",
            passed=payload.timeout_value > 0,
            details=(
                "The proposed timeout is greater than zero."
                if payload.timeout_value > 0
                else "The proposed timeout must be greater than zero."
            ),
        ),
    ]
    passed = all(check.passed for check in checks)
    record = VerificationRecord(
        id=uuid4(),
        incident_id=incident_id,
        status="passed" if passed else "failed",
        checked_at=datetime.now(timezone.utc),
        kind="sandbox",
        application_setting_name=payload.application_setting_name,
        checks=checks,
        summary=(
            "All deterministic sandbox checks passed."
            if passed
            else "One or more deterministic sandbox checks failed."
        ),
    )
    with _verification_lock:
        _verification_by_incident.setdefault(incident_id, []).append(record)
    return record


@router.post("/service-check", response_model=VerificationRecord, status_code=status.HTTP_201_CREATED)
def record_manual_service_check(incident_id: UUID, payload: ManualServiceCheckRequest) -> VerificationRecord:
    incident = get_incident(incident_id)
    if incident.source == "seeded-demo":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Use the automated sandbox checks for the seeded checkout demo.",
        )
    approvals = approval_records_for_incident(incident_id)
    if not approvals or approvals[-1].decision != "approved":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Record an approved human review before recording a service check.",
        )

    check_name = payload.check_name.strip()
    note = payload.note.strip()
    if not check_name:
        raise HTTPException(status_code=422, detail="Enter the name of the check you ran.")
    outcome_label = "passed" if payload.outcome == "passed" else "failed"
    record = VerificationRecord(
        id=uuid4(),
        incident_id=incident_id,
        status=payload.outcome,
        checked_at=datetime.now(timezone.utc),
        kind="manual",
        check_name=check_name,
        note=note,
        checks=[],
        summary=f"Manually recorded check {outcome_label}: {check_name}" + (f" — {note}" if note else "."),
    )
    with _verification_lock:
        _verification_by_incident.setdefault(incident_id, []).append(record)
    return record


@router.get("/verifications", response_model=list[VerificationRecord])
def list_verifications(incident_id: UUID) -> list[VerificationRecord]:
    if not incident_exists(incident_id):
        raise HTTPException(status_code=404, detail="Incident not found")
    return verification_records_for_incident(incident_id)
