# Executed evaluation results

Last run: 2026-11-07, local Windows environment, Node.js 26.1.0, Ollama with `qwen2.5:3b`.

## Automated suite

| Check | Result | Evidence |
|---|---:|---|
| Complete synthetic observations are reproducible and produce no risk classification | PASS | `test/protocol.test.js` |
| Missing and nonnumeric observations are reported without risk classification | PASS | `test/protocol.test.js` |
| Model schema rejects an attempted risk override | PASS | `test/orchestrator-safety.test.js` |
| Model schema rejects diagnosis and prescription fields | PASS | `test/orchestrator-safety.test.js` |
| Model cannot claim prior history absent from retrieved context | PASS | `test/orchestrator-safety.test.js` |
| Model cannot request an action beyond practitioner review | PASS | `test/orchestrator-safety.test.js` |
| Valid model output is restricted to constrained extraction | PASS | `test/orchestrator-safety.test.js` |
| MCP context, deterministic evaluation, alert submission, unauthorized access, and duplicate alert guard | PASS | `test/mcp.integration.test.js` |
| Practitioner approval/rejection, role restriction, duplicate decision protection, and persistence | PASS | `test/approval.integration.test.js` |
| Pending workflow action prevents duplicate execution for the same observation | PASS | `test/workflow-idempotency.test.js` |

Result: **10 passed, 0 failed** from `npm.cmd test`.

`npm.cmd audit --omit=dev` reported **0 vulnerabilities** after upgrading Zod to `4.6.7`.

## End-to-end workflow result

`npm.cmd start` successfully started the Ollama readiness check, custom MCP service, API, SQLite, and frontend. On 2026-11-07, `npm.cmd run test:e2e` completed registration through practitioner approval using the actual local `qwen2.5:3b` model and database after the dependency upgrade. Registration, encounter, and observation creation returned HTTP 201; workflow and approval returned HTTP 200; duplicate workflow returned HTTP 409. The validated model output and deterministic result matched the evidence below.

```mermaid
sequenceDiagram
  participant UI as Frontend
  participant API as Node API / SQLite
  participant G as LangGraph
  participant MCP as Custom MCP server
  participant LLM as Ollama qwen2.5:3b
  participant P as Practitioner
  UI->>API: Register synthetic patient
  UI->>API: Create encounter and record observations
  API->>G: Start workflow
  G->>MCP: get_patient_context
  MCP-->>G: Patient, encounter, recorded observations
  G->>MCP: evaluate_clinical_risk
  MCP-->>G: Protocol 0.1.0, classification null
  G->>LLM: Context + deterministic result + constrained schema
  LLM-->>G: history_context=none_recorded; requested_action=practitioner_review
  G->>MCP: submit_clinical_alert
  MCP-->>API: Pending alert + approval request
  UI->>P: Display evidence, tool calls, and pending alert
  P->>API: Approve and publish
  API-->>UI: Approved alert, audit and encounter state
```

### MCP calls and outputs

1. `get_patient_context` received patient and encounter UUIDs; returned the synthetic patient, encounter, one observation record, and `history: []` with an explicit no-history note.
2. `evaluate_clinical_risk` received the encounter UUID and six numeric observations (`temperature_c: 36.8`, `heart_rate_bpm: 72`, `respiratory_rate_per_min: 16`, `systolic_bp_mmhg: 118`, `diastolic_bp_mmhg: 76`, `oxygen_saturation_percent: 98`). It returned protocol `synthetic-observation-completeness@0.1.0`, status `not_clinically_assessed`, `clinical_risk_classification: null`, and empty missing/invalid fields.
3. `submit_clinical_alert` received the run/encounter IDs, backend-generated review title/body, and protocol/observation/encounter/run evidence references. It returned an alert ID, approval ID, and `pending_approval` status.

Example deterministic output:

```json
{"protocol_id":"synthetic-observation-completeness","protocol_version":"0.1.0","status":"not_clinically_assessed","clinical_risk_classification":null,"missing_observations":[],"invalid_observations":[],"triggered_rules":[]}
```

### Open-weights model evidence

The model used was `qwen2.5:3b` through the local Ollama API. Its exact validated output was:

```json
{"history_context":"none_recorded","requested_action":"practitioner_review"}
```

The request included a JSON Schema with only those two fields and enum values. The backend checked the history label against retrieved context. The model has no free-text alert, clinical classification, diagnosis, prescription, or consequential-action tool.

### Approval and audit evidence

The alert was pending before practitioner review. Practitioner approval returned HTTP 200 and `approved`; running again on the same observation returned HTTP 409. The encounter view contained all three successful MCP calls and 14 audit events, including model invocation/validation, alert approval request, agent completion, and `alert_approved_and_published`.

The services were stopped and restarted after the 2026-11-07 end-to-end run. `npm.cmd run test:persistence -- f8e42168-d703-4038-a132-c984a4fbc006` confirmed the approved alert and workflow, three successful MCP tool records, and 14 audit events remained available.

## Remaining evaluation gap and unresolved failure

Existing-patient detection is not implemented: `POST /api/patients` always inserts a new UUID, even when demographics match. Add synthetic identifier capture and a human-reviewed duplicate-candidate flow; do not merge automatically. History-pattern analysis, laboratory, consultation, pharmacy, eleven-screen workflow, borrowed MCP integration, and clean-machine reproducibility remain unimplemented or unverified.

## Earlier model failure and fix

The first free-text model response invented a missing history note. A later unconstrained completeness label conflicted with deterministic results. Both responses were rejected, persisted as rejected output, and did not create alerts. The implementation now supplies a JSON Schema, removes model-authored prose/classification, checks the history label, and creates alert text from validated evidence. Tests cover unsupported history, actions, risk, diagnosis, and prescription fields. Repeat these checks after model/runtime changes.
