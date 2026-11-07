# HealthcareAI2

HealthcareAI2 is an agentic clinical workflow assistance project for synthetic hospital workflows. Its first vertical slice registers a synthetic patient, opens an encounter, records observations, retrieves patient context, runs a deterministic completeness protocol, asks a local open-weights model for a structured draft, and routes an alert through practitioner approval.

> **Demonstration software only.** The current protocol checks required-field completeness and applies no clinical thresholds. The project is not validated for patient care and must not be used with real patient data.

## Current implementation status

Implemented source: Node.js 26 API and browser UI, SQLite persistence, three custom MCP tools, LangGraph orchestration, Ollama HTTP integration, role-based demo login, practitioner approval endpoints, and audit/tool-call persistence.

Verification so far: 10 automated tests pass. `npm.cmd run test:e2e` completed registration through practitioner approval with the actual local open-weights model. Startup readiness and persistence across a service restart passed locally. Clean-machine reproducibility and the rest of the hospital journey are still outstanding. See [known limitations](docs/11_MAINTENANCE/KNOWN_LIMITATIONS.md) and [evaluation results](docs/09_TESTING/EVALS.md).

## Quick start

Prerequisites: Node.js 26+, npm, and Ollama with `qwen2.5:3b` available locally.

```powershell
npm.cmd install
Copy-Item .env.example .env
ollama pull qwen2.5:3b
npm.cmd start
```

Open `http://127.0.0.1:3000`. Demo accounts: `nurse` / `nurse-demo`; `practitioner` / `practitioner-demo`. Run automated tests with `npm.cmd test`. With services running, `npm.cmd run test:e2e` executes the full model-backed workflow. These steps passed locally, not in a clean environment.

## Architecture

The API and UI use Node.js with the built-in SQLite database. The MCP server exposes `get_patient_context`, `evaluate_clinical_risk`, and `submit_clinical_alert` on loopback with an internal bearer token. LangGraph orders context retrieval, deterministic evaluation, constrained model explanation, and pending alert creation. The practitioner API owns authorization and approval. Approved alerts are published in the encounter and every tool call, model output, decision, and workflow event is recorded.

The LLM schema is strict and rejects extra fields such as clinical risk classification, diagnosis, or prescription. The deterministic result is stored independently and cannot be changed by model output.

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
