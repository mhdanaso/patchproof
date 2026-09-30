# ProofPatch

**Evidence-first incident response, with verified fixes and human approval.**

ProofPatch is a beginner-friendly hackathon MVP. It demonstrates one incident end to end: show a repeatable demo failure, present the evidence and likely cause, suggest a fix, and keep the approval decision with a person.

## MVP workflow

```text
Demo incident → evidence → likely cause → suggested fix → verification → human review
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

### 2. Open the dashboard

In a second terminal, from the repository root:

```bash
python -m http.server 5500 --directory frontend
```

Open <http://127.0.0.1:5500> and choose **Load demo incident**.

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
