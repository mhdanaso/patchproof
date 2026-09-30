"""Incident intake routes for the ProofPatch API."""

from datetime import datetime, timezone
from threading import Lock
from uuid import UUID, uuid4

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/incidents", tags=["incidents"])


class IncidentIntake(BaseModel):
    """Information supplied when an alert or person reports an incident."""

    title: str = Field(min_length=1, max_length=160)
    service: str = Field(min_length=1, max_length=100)
    severity: str = Field(default="medium", pattern="^(low|medium|high|critical)$")
    description: str = Field(default="", max_length=2000)
    symptoms: list[str] = Field(default_factory=list, max_length=30)
    source: str = Field(default="manual", max_length=100)


class IncidentRecord(IncidentIntake):
    id: UUID
    status: str = "open"
    created_at: datetime


# In-memory storage keeps this MVP self-contained. Replace with a database later.
_incidents: dict[UUID, IncidentRecord] = {}
_incidents_lock = Lock()


@router.post("", response_model=IncidentRecord, status_code=status.HTTP_201_CREATED)
def create_incident(payload: IncidentIntake) -> IncidentRecord:
    """Record an incoming incident and return its ID and intake status."""
    incident = IncidentRecord(
        **payload.model_dump(),
        id=uuid4(),
        status="open",
        created_at=datetime.now(timezone.utc),
    )
    with _incidents_lock:
        _incidents[incident.id] = incident
    return incident


@router.get("", response_model=list[IncidentRecord])
def list_incidents() -> list[IncidentRecord]:
    """List incidents received since this API process started."""
    with _incidents_lock:
        return sorted(_incidents.values(), key=lambda item: item.created_at, reverse=True)


@router.get("/{incident_id}", response_model=IncidentRecord)
def get_incident(incident_id: UUID) -> IncidentRecord:
    """Fetch one incident by the ID returned by the intake endpoint."""
    with _incidents_lock:
        incident = _incidents.get(incident_id)
    if incident is None:
        raise HTTPException(status_code=404, detail="Incident not found")
    return incident
