# HealthcareAI2

HealthcareAI2 is an agentic clinical workflow assistance project for synthetic hospital workflows. Its first vertical slice registers a synthetic patient, opens an encounter, records observations, retrieves patient context, runs a deterministic completeness protocol, asks a local open-weights model for a structured draft, and routes an alert through practitioner approval.

> **Demonstration software only.** The current protocol checks required-field completeness and applies no clinical thresholds. The project is not validated for patient care and must not be used with real patient data.

## Current implementation status

Implemented source: Node.js 26 API and browser UI, SQLite persistence, three custom MCP tools, LangGraph orchestration, Ollama HTTP integration, role-based demo login, practitioner approval endpoints, and audit/tool-call persistence.

Verification so far: 11 automated tests pass, including the synthetic department journey and draft-rule checks. `npm.cmd run test:e2e` completed registration through practitioner approval with the actual local open-weights model. Startup readiness and persistence across a service restart passed locally. Clean-machine reproducibility and clinical validation are still outstanding. See [known limitations](docs/11_MAINTENANCE/KNOWN_LIMITATIONS.md) and [evaluation results](docs/09_TESTING/EVALS.md).

## Quick start

Prerequisites: Node.js 26+, npm, and Ollama with `qwen2.5:3b` available locally.

```powershell
npm.cmd install
Copy-Item .env.example .env
ollama pull qwen2.5:3b
npm.cmd start
```

Open `http://127.0.0.1:3000`. Synthetic department accounts are `attendant` / `attendant-demo`, `nurse` / `nurse-demo`, `doctor` / `doctor-demo`, `laboratory` / `laboratory-demo`, and `pharmacist` / `pharmacist-demo`. Follow [the department handoff walkthrough](docs/00_GETTING_STARTED/DEMO_WORKFLOW.md) to carry a patient through all stages using name search. A narrow WHO-based, rules-driven test draft and adult very-high-BP review prompt are available; broader clinical decision support, medicine/dose advice, and normal/urgency classification are not. Run automated tests with `npm.cmd test`; with services running, `npm.cmd run test:e2e` exercises the original model-backed API workflow.

## Architecture

The API and UI use Node.js with the built-in SQLite database. The MCP server exposes `get_patient_context`, `evaluate_clinical_risk`, and `submit_clinical_alert` on loopback with an internal bearer token. LangGraph orders context retrieval, deterministic evaluation, constrained model explanation, and pending alert creation. The practitioner API owns authorization and approval. Approved alerts are published in the encounter and every tool call, model output, decision, and workflow event is recorded.

The legacy workflow LLM schema is strict and rejects extra fields such as clinical risk classification, diagnosis, or prescription. Nurse vital-sign saves separately request a constrained local-model explanation; the model must echo the server-assigned risk level exactly and cannot change it.

## Documentation

- [Start here](docs/00_GETTING_STARTED/START_HERE.md)
- [Requirements and gates](docs/01_PROJECT/REQUIREMENTS.md)
- [Architecture](docs/03_ARCHITECTURE/ARCHITECTURE.md)
- [Clinical evaluation boundary](docs/04_AI_AND_AGENTS/CLINICAL_EVALUATION.md)
- [Custom MCP tools](docs/05_MCP_SERVERS/CUSTOM_MCP_SERVER.md)
- [Approval and human oversight](docs/08_SECURITY_AND_SAFETY/HUMAN_OVERSIGHT.md)
- [Audit records](docs/08_SECURITY_AND_SAFETY/AUDIT_LOGGING.md)
- [Executed evaluations](docs/09_TESTING/EVALS.md)

## License

No license has been selected yet. Until an OSI-approved license is added, the source is not offered under an open-source license.
