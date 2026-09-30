# Contributing to ProofPatch

Welcome! Keep changes small and explain them clearly. This project is a 24-hour MVP, so agree on the API shape before building extra features.

## Team areas

- `frontend/` — dashboard and incident workflow
- `backend/` — API, evidence handling, and analysis
- `demo-app/` — controlled service failure for the demonstration

## Branches and collaboration

- Keep `main` runnable and use it for the demo.
- Create one branch per task: `feat/incident-card`, `feat/triage-api`, or `fix/demo-health-check`.
- Pull the latest `main` before starting a task; avoid editing the same files at the same time.
- Open a pull request and ask one teammate to review it before merging.
- Prefer small commits with clear messages, such as `Add sample incident endpoint`.

## Working agreement

- Share the API request/response shape before frontend and backend integration.
- Never commit API keys, tokens, or `.env` files.
- Keep generated fixes as suggestions. A person must review and approve before any external action.
- Tell the team when an interface or file structure needs to change.
