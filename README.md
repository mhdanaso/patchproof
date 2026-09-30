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

### Record approval and verify a proposed fix

Record a human decision with `POST /api/incidents/{incident_id}/approvals`,
using `decision` (`approved` or `rejected`), `approver`, and an optional `note`.
`GET /api/incidents/{incident_id}/approvals` returns the approval history. An
approval record is an audit entry only; it does not apply a recommendation.
Verification endpoints require the latest approval to be `approved`.

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
These sandbox checks are available for the seeded checkout demo only.

### Record a manual service check

For a custom incident, run a project-specific test or health check yourself,
then record what happened with `POST
/api/incidents/{incident_id}/service-check`. The latest approval must be
`approved`. This endpoint records the result; it does not execute a command,
call a service, or verify the result independently.

Example request body:

```json
{
  "check_name": "GET /health",
  "outcome": "passed",
  "note": "Returned HTTP 200 after the configuration update."
}
```

Set `outcome` to `passed` or `failed`. `check_name` is required; `note` is
optional. The result is included in `GET /api/incidents/{incident_id}/report`
and the incident timeline.

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

Open <http://127.0.0.1:5500>. Choose **Start demo incident** for the guided
checkout example, or choose **Report a problem** to submit a title, affected
service, severity, description, and symptoms. A custom report is saved through
`POST /api/incidents`; its description and symptoms are attached as evidence
through `POST /api/incidents/{id}/evidence`; the dashboard then requests
`POST /api/incidents/{id}/analyze` and `GET /api/incidents/{id}/report`. With
`AI_API_KEY` configured, the optional model uses the supplied report and evidence
to suggest a likely cause and fix. Without the key, ProofPatch gives a cautious
evidence-based fallback and asks for more information rather than claiming an
unsupported root cause. Review the recommendation and record approval or
rejection.

For a custom incident, approve the recommendation, run a project-specific test
or health check outside ProofPatch, then record the check name, pass/fail result,
and optional note in the **Service check** panel. The report timeline records
that manual result. The seeded demo uses its built-in deterministic sandbox
checks.

The incident workspace supports incident intake, seeded evidence collection,
deterministic root-cause analysis, optional AI enrichment, reviewer
approval/rejection, seeded sandbox verification, manual service-check recording
for custom incidents, and a chronological incident report. The optional AI
provider is loaded from `backend/.env`:

```env
AI_API_URL=https://openrouter.ai/api/v1/chat/completions
AI_API_KEY=your_key_here
AI_MODEL=openrouter/free
```

Restart Uvicorn after changing `.env`. The deterministic evidence analysis and workflow remain available if the provider is unavailable or returns an invalid response.

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

## GitHub branches and contributor credit

- Keep `main` as the stable demo branch.
- Use `integration` as the shared branch for combining and reviewing team work.
- Create task branches from `integration`, then open pull requests into
  `integration`. When the combined work is ready, merge `integration` into
  `main`.
- Merging a branch does not grant repository access. The repository owner adds
  teammates under **Settings → Collaborators**.
- GitHub can attribute commits in the repository's Contributors view when the
  original author email is linked to that person's GitHub account and the
  commit reaches the repository's default branch. Ask each teammate to commit
  their own changes or preserve their original commit authorship. The merge
  commit itself does not count as a contributor commit; GitHub's contributor
  data can take up to 24 hours to refresh. See [GitHub's contributor graph
  documentation](https://docs.github.com/en/repositories/viewing-activity-and-data-for-your-repository/viewing-a-projects-contributors).

## Safety boundary

This is a demo, not a production incident-response system. Do not connect it to production credentials or let it apply changes automatically. A human must review proposed changes before any pull request or remediation action.
