# Requirements and acceptance gates

This document condenses the master development prompt. A requirement is not complete merely because it is documented; completion requires implementation and evidence.

## Gate 0 — foundation

- Inspect the repository and record reusable code and dependencies.
- Establish `docs/`, document requirements, initial architecture, and ordered implementation plan.
- Baseline finding: no source code, dependency manifests, or tests were present.

## Gate 1 — one end-to-end vertical workflow

Register a synthetic patient, retrieve/create a record, create an encounter, retrieve history, record synthetic observations, run a versioned deterministic evaluation, pass validated evidence to an open-weights model through a real orchestration framework, validate its structured output, create an actionable alert and approval request, record an authorized approve/reject decision, execute an approved action, audit every step, and show resulting encounter/alert state in a backend-connected frontend.

Required evidence: actual services and database; actual custom MCP tool calls; model participation; approval; persisted audit records; automated test results; known failures. Do not expand to remaining departments before this gate passes.

## Gate 2 — clinical separation

The deterministic engine owns objective protocol evaluation and records protocol version, triggered rules, missing/invalid data, and reproducible results. The LLM may explain and draft structured considerations from validated results and retrieved context. Backend validation and conflict checks must prevent an LLM output from changing deterministic classifications or bypassing approval. Tests must prove this boundary.

## Later gates

1. Custom MCP server with `get_patient_context`, `evaluate_clinical_risk`, and `submit_clinical_alert`, validated schemas, authorization, error handling, and meaningful action.
2. A documented borrowed MCP server, justified by source, licence, and purpose.
3. Open-source orchestration and open-weights inference doing a genuine task.
4. Backend-enforced approval, audit, authorization, and duplicate-action protection.
5. Eleven shared-layout screens connected to backend behavior.
6. Department workflow continuity and eight or more meaningful evaluations, with honest pass/fail results and an unresolved failure documented.
7. Tested one-command startup and clean-environment limitations.
8. Submission materials, licence, demo script, and public video only when actually prepared.

## Safety and data requirements

Use synthetic data. Preserve provenance and distinguish recorded facts from generated interpretations. Never let the model invent thresholds, fabricate history/results, confirm a diagnosis, prescribe, override deterministic rules, or bypass practitioner review. Apply authentication, role permissions, validation, audit logging, and approval gates to consequential actions.
