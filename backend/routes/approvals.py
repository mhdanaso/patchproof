"""Human approval audit records for proposed remediation."""

from datetime import datetime, timezone
from threading import Lock
from typing import Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from routes.incidents import incident_exists

router = APIRouter(prefix="/api/incidents/{incident_id}/approvals", tags=["approvals"])


class ApprovalInput(BaseModel):
    decision: Literal["approved", "rejected"]
    approver: str = Field(min_length=1, max_length=120)
    note: str = Field(default="", max_length=1000)


class ApprovalRecord(ApprovalInput):
    id: UUID
    incident_id: UUID
    recorded_at: datetime


_approvals_by_incident: dict[UUID, list[ApprovalRecord]] = {}
_approval_lock = Lock()


def approval_records_for_incident(incident_id: UUID) -> list[ApprovalRecord]:
    with _approval_lock:
        return list(_approvals_by_incident.get(incident_id, []))


@router.post("", response_model=ApprovalRecord, status_code=status.HTTP_201_CREATED)
def record_approval(incident_id: UUID, payload: ApprovalInput) -> ApprovalRecord:
    """Record a human decision without performing the proposed remediation."""
    if not incident_exists(incident_id):
        raise HTTPException(status_code=404, detail="Incident not found")
    approval = ApprovalRecord(
        **payload.model_dump(),
        id=uuid4(),
        incident_id=incident_id,
        recorded_at=datetime.now(timezone.utc),
    )
    with _approval_lock:
        _approvals_by_incident.setdefault(incident_id, []).append(approval)
    return approval


@router.get("", response_model=list[ApprovalRecord])
def list_approvals(incident_id: UUID) -> list[ApprovalRecord]:
    if not incident_exists(incident_id):
        raise HTTPException(status_code=404, detail="Incident not found")
    return approval_records_for_incident(incident_id)
