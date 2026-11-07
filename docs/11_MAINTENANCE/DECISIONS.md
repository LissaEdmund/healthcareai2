# Architecture decisions

## 2026-11-06 — Begin with a documentation foundation

**Context:** The repository inspection found no implementation or dependencies, while the master prompt requires ordered gates and prohibits expansion before a complete vertical workflow passes.

**Decision:** Record requirements, a provisional architecture, and an evidence-based implementation plan before choosing a large application stack. Keep all capabilities explicitly labeled as proposed until implemented and verified.

**Consequences:** No technology or clinical protocol is implied by this documentation. The next design step must select the smallest viable stack for the vertical workflow and document the choice before relying on it.

## 2026-11-06 — Select a Node.js vertical-slice stack

**Context:** The repository is empty. The environment provides Node.js 26 and built-in SQLite, but no Python, Docker, or Ollama executable/API.

**Decision:** Use Node.js HTTP services and built-in `node:sqlite` for the first slice, the official MCP TypeScript SDK for a loopback-only custom MCP server, LangGraph.js for the orchestrated flow, and an Ollama-compatible local open-weights model endpoint. Serve the first workflow UI from the backend.

**Safety boundary:** The initial `synthetic-observation-completeness` protocol only checks missing or nonnumeric fields. It sets no thresholds and always leaves `clinical_risk_classification` null. It is not a clinical protocol or a validated triage tool. Practitioner approval gates publishing the drafted informational alert.

**Consequences:** Node 26+, npm dependencies, and Ollama/model preparation are required. Only Node 26 is currently available; model and integration behavior remain unverified until the services are exercised. Other MCP integrations and department workflows remain later work.
