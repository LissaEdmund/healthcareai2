# Initial architecture

**Status: first vertical workflow verified locally.** The repository began empty. The first vertical slice uses Node.js 26, built-in SQLite, LangGraph.js, the official MCP TypeScript SDK, and a local Ollama open-weights model. Ten automated tests, one-command readiness, the complete model-backed workflow, practitioner approval, audit display, and persistence after service restart passed locally. Clean-environment verification and later departments remain outstanding.

## Components

1. **Frontend:** implemented single-page workflow for synthetic registration, observations, run output, MCP details, approvals, and audit display. The remaining ten screens are not built.
2. **Backend/API:** implemented Node.js HTTP endpoints, local demo-role sessions, input validation, workflow routes, and practitioner-only approval enforcement.
3. **Database:** implemented SQLite tables for patients, encounters, observations, agent runs, alerts, approvals, tool calls, sessions, workflow idempotency, and audit events.
4. **Deterministic evaluator:** implemented versioned completeness validation only; it assigns no clinical classification or thresholds.
5. **Custom MCP server:** implemented three schema-validated tools behind loopback binding and an internal bearer token. Real context and evaluation calls are verified; alert submission and duplicate handling are automated tests.
6. **Borrowed MCP server:** not integrated.
7. **Orchestrator and model:** LangGraph graph and schema-constrained Ollama inference are implemented and ran in the successful end-to-end workflow.
8. **Approval and audit:** backend approval, rejection, role checks, duplicate-decision prevention, tool logs, and audit persistence have automated test coverage.

## Mandatory ordering

```text
Validate observations -> retrieve authorized context -> deterministic evaluation
 -> validate protocol result -> model explanation/draft -> schema and evidence checks
 -> conflict detection -> practitioner approval -> idempotent execution -> audit/UI refresh
```

The model schema disallows classification, diagnosis, and prescription fields, so such output fails validation and leaves the deterministic result untouched. The model has no tool to publish an alert; MCP only creates a pending request. Practitioner approval is required to publish. Broader semantic claim/evidence checking remains a limitation.

## Decisions still open

The borrowed MCP server, non-demo identity, production database, deployment packaging, full frontend screen architecture, and real approved clinical protocol remain open. See `../11_MAINTENANCE/DECISIONS.md`.
