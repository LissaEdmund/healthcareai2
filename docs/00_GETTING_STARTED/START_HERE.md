# START HERE

## Current status

The registration-to-review vertical workflow passes locally with an actual open-weights model. It has a Node.js backend, SQLite persistence, custom MCP server, LangGraph workflow, browser UI, approval routes, and audit storage. Ten automated checks pass. Startup readiness and persisted approval/tool/audit records after service restart were verified. Clean-environment setup has not been verified. The protocol checks field completeness only and has no clinical thresholds. This is a local synthetic demonstration, not for clinical use.

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

The backend, SQLite, MCP server, graph, API, and first workflow UI exist. The first gate passed locally: model output was validated, the agent created a pending alert, a practitioner approved it, and the updated encounter/audit state was retrievable.

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

Demo accounts are `nurse` / `nurse-demo` and `practitioner` / `practitioner-demo`, unless changed in `.env`. Sign in as nurse, register a synthetic patient, record observations, and run the agent. Sign out and sign in as practitioner to approve or reject the alert. MCP inputs/outputs and audit events appear in the encounter view. Run unit/integration checks with `npm.cmd test`; while services are running, execute the real model-backed workflow with `npm.cmd run test:e2e`. Clean-environment reproducibility has not been checked.

For debugging, run `node src/mcp-server.js` and `node src/server.js` in separate terminals; the latter serves both API and UI. Stop each with Ctrl+C. The single startup command is `npm.cmd start`. See [environment variables](ENVIRONMENT_VARIABLES.md) and [troubleshooting](TROUBLESHOOTING.md).
