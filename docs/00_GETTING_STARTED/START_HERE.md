# START HERE

## Current status

The local synthetic department workflow covers attendant registration, nurse observations, the doctor's initial test request, laboratory results, the doctor's result review, and pharmacist dispensing. The UI uses role-based demo logins and patient name search. The current test-draft rules are narrow, deterministic WHO-based drafts for clinician review; they are not the model-backed alert workflow described in some legacy architecture notes. The app is a local demonstration, not for clinical use.

## What the project is intended to do

HealthcareAI2 is intended to coordinate clinical workflow information across a hospital encounter and help practitioners review relevant facts and proposed actions. It uses synthetic records for the demonstration. It does not replace clinicians, independently diagnose, or autonomously prescribe or dispense.

## Current architecture

The target design separates a web frontend, authenticated backend, relational database, custom MCP tools, an open-source orchestration layer, and a locally hosted open-weights model. A deterministic, versioned demonstration protocol evaluates observations before any model explanation is requested. Consequential actions require practitioner approval. Tool calls, model output, approvals, and execution outcomes are auditable.

```text
Practitioner UI -> Authenticated API -> Encounter/database
                                    -> deterministic protocol
                                    -> orchestrator -> custom MCP tools
                                                     -> local open-weights model
                                    -> approval gate -> audited action
```

The backend, SQLite, MCP server, graph, API, synthetic department handoff UI, and original model-backed workflow exist. The department UI uses small deterministic WHO draft rules for selected test requests and a high adult-BP review prompt; these are not LLM-generated or clinically validated recommendations. Medication/dose/substitution suggestions and full urgency triage are not implemented.

## Requirements and eventual commands

Prerequisites are Node.js 26+, npm, Ollama, and enough disk and memory for the selected model. The configured `qwen2.5:3b` model files are about 1.9 GB; runtime memory depends on context and hardware. Install Ollama from [the official Windows page](https://ollama.com/download/windows). In PowerShell:

```powershell
npm.cmd install
Copy-Item .env.example .env
ollama pull qwen2.5:3b
npm.cmd start
```

The root startup command starts Ollama if needed, custom MCP, backend, and UI, then checks readiness/model availability. `npm.cmd start` passed on this machine. If needed, it detects the standard per-user Windows Ollama executable path; set `OLLAMA_EXECUTABLE` if yours differs. The backend initializes SQLite tables using idempotent `CREATE TABLE IF NOT EXISTS` statements; there is no versioned migration system yet.

## How to use this guide

Department demo accounts are `attendant` / `attendant-demo`, `nurse` / `nurse-demo`, `doctor` / `doctor-demo`, `laboratory` / `laboratory-demo`, and `pharmacist` / `pharmacist-demo`, unless passwords are changed in `.env`. Follow the department walkthrough below. The doctor first-visit screen includes a narrow WHO-based test-draft rule for suspected malaria and limited adult lower-UTI scenarios; suggestions are editable and must be reviewed. A high adult blood-pressure prompt is also available. These rules do not make an LLM diagnosis, medication/dose recommendation, or full normal/urgency classification. Run checks with `npm.cmd test`; `npm.cmd run test:e2e` exercises the original model-backed API workflow. Clean-environment reproducibility has not been checked.

For debugging, run `node src/mcp-server.js` and `node src/server.js` in separate terminals; the latter serves both API and UI. Stop each with Ctrl+C. The single startup command is `npm.cmd start`. See [environment variables](ENVIRONMENT_VARIABLES.md) and [troubleshooting](TROUBLESHOOTING.md).

## Try the department handoffs

The local synthetic workflow has attendant, nurse, doctor, laboratory, and pharmacist demo accounts. Start the app as above and follow [the department handoff walkthrough](DEMO_WORKFLOW.md), signing out between roles and searching for the same patient by name. The attendant does not need an encounter ID. The WHO-based test drafts and BP review prompt are narrow prototype rules; medication suggestions and broader urgency assessment require additional clinical configuration.
