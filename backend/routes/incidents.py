"""Incident intake routes for the ProofPatch API."""

from datetime import datetime, timezone
from threading import Lock
from uuid import UUID, uuid4

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/incidents", tags=["incidents"])


class IncidentIntake(BaseModel):
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


_incidents: dict[UUID, IncidentRecord] = {}
_incidents_lock = Lock()


@router.post("", response_model=IncidentRecord, status_code=status.HTTP_201_CREATED)
def create_incident(payload: IncidentIntake) -> IncidentRecord:
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
    with _incidents_lock:
        return sorted(_incidents.values(), key=lambda item: item.created_at, reverse=True)


@router.get("/{incident_id}", response_model=IncidentRecord)
def get_incident(incident_id: UUID) -> IncidentRecord:
    with _incidents_lock:
        incident = _incidents.get(incident_id)
    if incident is None:
        raise HTTPException(status_code=404, detail="Incident not found")
    return incident


def incident_exists(incident_id: UUID) -> bool:
    with _incidents_lock:
        return incident_id in _incidents
