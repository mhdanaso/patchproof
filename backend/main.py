"""ProofPatch API: a tiny, evidence-first incident response MVP."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="ProofPatch API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class Incident(BaseModel):
    title: str = "Checkout errors are increasing"
    service: str = "demo-checkout"
    symptoms: list[str] = ["HTTP 500 responses", "checkout health check failing"]


@app.get("/api/health")
def health():
    return {"status": "ok", "app": "ProofPatch"}


@app.get("/api/demo-incident")
def demo_incident():
    """Return a repeatable sample incident so the UI works without credentials."""
    return {
        "title": "Checkout errors are increasing",
        "service": "demo-checkout",
        "severity": "high",
        "symptoms": ["HTTP 500 responses", "checkout health check failing"],
        "evidence": [
            {"source": "health check", "observation": "GET /health returned 500"},
            {"source": "application log", "observation": "KeyError: 'PAYMENT_TIMEOUT'"},
            {"source": "recent change", "observation": "Payment timeout setting was renamed"},
        ],
        "root_cause": "The app expects PAYMENT_TIMEOUT, but the demo configuration uses PAYMENT_TIMEOUT_MS.",
        "suggested_fix": "Read PAYMENT_TIMEOUT_MS (or restore the old setting name) and add a configuration test.",
        "verification": "Pending: run the demo check after applying a patch.",
        "approval": "Human approval required before opening a pull request.",
    }


@app.post("/api/triage")
def triage(incident: Incident):
    """Starter deterministic triage endpoint; an optional free LLM can be added later."""
    return {
        "title": incident.title,
        "service": incident.service,
        "severity": "high" if incident.symptoms else "unknown",
        "evidence": incident.symptoms,
        "root_cause": "Not determined yet. Collect logs and recent-change evidence first.",
        "next_step": "Review evidence, then propose a fix for human review.",
    }
