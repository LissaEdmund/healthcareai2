# Implementation plan

Work follows the mandatory gates in the master prompt. Expansion is blocked until the vertical workflow is executed and its evidence is recorded.

## Phase 0 — repository and documentation foundation

**Finding:** repository contains no tracked source or dependency files. **Deliverable:** this requirements baseline, proposed architecture, and plan. **Status:** documentation foundation started; no runtime behavior exists.

## Phase 1 — vertical workflow design and implementation

Select a minimal stack and define the synthetic patient, encounter schema, demonstration protocol, MCP tools, orchestration boundary, model interface, approval states, audit records, and frontend path. Build only registration through reviewed alert execution. Run automated tests against actual services; capture example tool requests/responses and audit evidence. Stop and fix any gate failure.

## Phase 2 — clinical boundary

Add schema validation, protocol versioning, conflict detection, missing-information behavior, and tests proving model output cannot modify deterministic classifications or execute actions.

## Phases 3–5 — MCP, model, approval, audit

Implement and exercise custom MCP tools; integrate a borrowed server only after source/licence review; run the selected open-source orchestrator with an open-weights model; enforce human approvals, authorization, idempotency, and audit integrity.

## Phases 6–7 — expansion

Only after the vertical gate passes, build the eleven screens and connect department workflows to the same patient and encounter records.

## Phases 8–10 — evaluation and submission

Run and report real evaluations, document failures, test startup and restart persistence, complete operational documentation, then prepare repository and demo deliverables. Do not claim clean-environment or public-video verification without evidence.
