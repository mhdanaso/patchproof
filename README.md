# ProofPatch

**Evidence-first incident response, with verified fixes and human approval.**

ProofPatch is a beginner-friendly hackathon MVP. It demonstrates one incident end to end: show a repeatable demo failure, present the evidence and likely cause, suggest a fix, and keep the approval decision with a person.

## MVP workflow

```text
Demo incident → evidence → likely cause → human approval → sandbox verification → incident report
```

The starter uses deterministic sample data, so it works without a paid model or API key. Add a free model provider only after the end-to-end demo works; keep evidence collection and verification deterministic.

## Repository layout

```text
proofpatch/
├── backend/       # FastAPI endpoints
├── frontend/      # Static dashboard (no Node setup needed)
├── demo-app/      # Reproducible failing health check
├── CONTRIBUTING.md
└── README.md
```

## Run it locally

You need Python 3.10 or newer.

### 1. Start the API

```bash
cd backend
python -m venv .venv
# Windows PowerShell: .venv\Scripts\Activate.ps1
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

API health: <http://127.0.0.1:8000/api/health>  
Interactive API docs: <http://127.0.0.1:8000/docs>

### Submit an incident

`POST /api/incidents` accepts a JSON body with `title` and `service` required.
Optional fields are `severity` (`low`, `medium`, `high`, or `critical`),
`description`, `symptoms` (a list of strings), and `source` (defaults to
`manual`). The response includes a generated incident ID, an `open` status,
and the UTC creation time. Use `GET /api/incidents` to list incidents or
`GET /api/incidents/{incident_id}` to retrieve one. Intake records are kept in
memory for the lifetime of the API process.

Example:

```json
{
  "title": "Checkout returns HTTP 500",
  "service": "demo-checkout",
  "severity": "high",
  "description": "Errors began after a configuration change.",
  "symptoms": ["GET /health returned 500"],
  "source": "demo-alert"
}
```

### Collect incident evidence

Attach a piece of evidence with `POST /api/incidents/{incident_id}/evidence`.
Each item has a `source`, an `observation`, and optional structured `details`.
Use `GET /api/incidents/{incident_id}/evidence` to retrieve the incident's
evidence. For the checkout demo, `POST
/api/incidents/{incident_id}/evidence/collect-demo` adds repeatable health-check,
application-log, and recent-change evidence fixtures without requiring external
services. Repeating the demo collection does not add duplicates. Evidence is
held in memory and is cleared when the API process restarts.

Example request body for manually attaching evidence:

```json
{
  "source": "application log",
  "observation": "KeyError: PAYMENT_TIMEOUT",
  "details": {"file": "demo-app/app.py", "line": 13}
}
```

### Triage and analyze an incident

Call `POST /api/incidents/{incident_id}/analyze` after collecting evidence.
The deterministic analysis returns a triage summary, severity, evidence sources,
a root-cause finding with confidence and supporting evidence IDs, remediation
recommendations, and next steps. The current rule recognizes the demo's missing
configuration setting when the application log and recent-change evidence agree.
If the evidence is incomplete or does not match that rule, the API reports the
cause as undetermined and recommends gathering more evidence. Recommendations
are advisory; the API does not apply changes and marks human approval as required.

### Verify a proposed fix and record approval

`POST /api/incidents/{incident_id}/verify` checks a proposed demo configuration
against fixed rules: the application setting is supported, that setting appears
in the proposed configuration, and the timeout value is positive. This is a
deterministic contract check; it does not execute submitted code or modify the
demo service. For example:

```json
{
  "application_setting_name": "PAYMENT_TIMEOUT_MS",
  "configured_setting_names": ["PAYMENT_TIMEOUT_MS"],
  "timeout_value": 30000
}
```

Use `GET /api/incidents/{incident_id}/verifications` to view prior results.
Record a human decision with `POST /api/incidents/{incident_id}/approvals`,
using `decision` (`approved` or `rejected`), `approver`, and an optional `note`.
`GET /api/incidents/{incident_id}/approvals` returns the approval history. An
approval record is an audit entry only; it does not apply a recommendation.

### Generate an incident report

`GET /api/incidents/{incident_id}/report` combines the incident, collected
evidence, latest analysis, approval history, verification history, and a
chronological timeline. Run analysis and record any verification or approval
first if you want those entries included. The underlying workflow records are
in memory and reset when the API restarts.

### 2. Open the dashboard

In a second terminal, from the repository root:

```bash
python -m http.server 5500 --directory frontend
```

Open <http://127.0.0.1:5500> and choose **Start demo incident**. Review the evidence, enter a reviewer name, approve or reject the recommendation, and run verification after approval to finish the report.

### 3. Run the controlled failure (optional)

In another terminal, from the repository root:

```bash
python demo-app/app.py
```

Open <http://127.0.0.1:8080/health>. It returns an intentional 500 until `PAYMENT_TIMEOUT` is configured. This gives the team a simple reproducible incident to improve during the hackathon.

## Four-person starting split

1. **Backend and AI:** API shape, evidence, optional free-model integration.
2. **Frontend:** dashboard, incident view, evidence and approval experience.
3. **Demo and verification:** controlled failure, repeatable checks, patch workflow.
4. **Integration and demo lead:** coordinate branches, connect the pieces, prepare the walkthrough.

See [CONTRIBUTING.md](CONTRIBUTING.md) for branch and review guidance.

## Safety boundary

This is a demo, not a production incident-response system. Do not connect it to production credentials or let it apply changes automatically. A human must review proposed changes before any pull request or remediation action.
