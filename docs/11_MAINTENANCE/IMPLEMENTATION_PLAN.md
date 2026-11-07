# Implementation plan

Work follows the mandatory gates in the master prompt. The first vertical workflow has passed locally and its evidence is recorded in [EVALS.md](../09_TESTING/EVALS.md). Expansion may now begin, but must retain the deterministic/model boundary.

## Phase 0 — repository and documentation foundation

**Finding:** repository initially contained no source or dependency files. **Deliverable:** requirements baseline, architecture, and plan. **Status:** complete; the baseline and decisions are documented.

## Phase 1 — vertical workflow design and implementation

Selected stack: Node.js 26, built-in SQLite, official MCP TypeScript SDK, LangGraph.js, Zod/JSON Schema output validation, and local Ollama HTTP inference. Registration, encounter, observation, custom MCP, graph, approval, audit, and first UI paths are implemented. Ten automated checks pass; `npm.cmd run test:e2e` passed with the actual local model. The one-command startup, approval decision, duplicate guard, and local persistence after restart were verified. Clean-environment verification remains open.

## Phase 2 — clinical boundary

Implemented: protocol versioning, missing/invalid-field output, strict schema-constrained model output, deterministic evidence checks, and tests rejecting risk classification, diagnosis, prescription, unsupported history, and unsupported actions. Remaining: broader claim-to-source validation before any model-authored prose, and an approved clinical protocol before any clinical risk feature is considered.

## Phases 3–5 — MCP, model, approval, audit

Implemented and tested: custom MCP tools, LangGraph flow, live open-weights model execution, schema constraints, practitioner approval, role checks, idempotency, and audit storage. Pending: borrowed MCP server selection/integration and broader audit integrity controls.

## Phases 6–7 — expansion

Only after the vertical gate passes, build the eleven screens and connect department workflows to the same patient and encounter records.

## Phases 8–10 — evaluation and submission

Run and report real evaluations, document failures, test startup and restart persistence, complete operational documentation, then prepare repository and demo deliverables. Do not claim clean-environment or public-video verification without evidence.
