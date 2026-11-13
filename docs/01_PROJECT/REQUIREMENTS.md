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

## Target: complete patient journey

The product target is a single synthetic patient journey with six role-specific handoffs. The initial and results consultations are distinct doctor stages and can be completed by different doctors.

| Stage | Staff role | Required workflow |
|---|---|---|
| 1 | Attendant | Find or register the patient, safely handle possible duplicate records, and open the encounter. |
| 2 | Nurse | Record observations such as blood pressure, temperature, and weight with units, timestamp, and author. |
| 3 | Doctor — initial consultation | Record the patient's reported concerns and examination; review concise, sourced history/patterns; decide and record requested tests. |
| 4 | Laboratory personnel | See authorized test requests, record specimen and results with provenance/status, and return results to the same encounter. |
| 5 | Doctor — results consultation | Review results alongside reported concerns, observations, and relevant history; record explanation, assessment, and medication orders. A different doctor may take this stage. |
| 6 | Pharmacist | Review the authorized medication order, record dispensing, and document the instructions explained to the patient. |

At every handoff, the next authorized role must see the relevant longitudinal record without confusing patient-reported facts, staff-entered facts, laboratory results, AI suggestions, and clinician decisions. The agent should automatically refresh its stage-specific review when authorized staff save new data, while recording its inputs, output, model/protocol version, and time. Staff can sign in to each role with separate demo accounts for demonstrations. A recommendation never silently becomes an order, diagnosis, test, or dispensing action.

Urgency alerts are a separate, safety-critical requirement. They may be presented as severity-based only after a clinician-approved protocol defines input requirements, thresholds, escalation wording, missing-data behavior, and validation evidence. Until then, show data-quality/completeness warnings and make clear they are not severity assessment. High-impact recommendations and orders require the responsible licensed professional's confirmation and an auditable record.

The app supports synthetic registration, name search, nurse observations, and the later department handoffs with role checks and persisted authorship/timestamps. It adds limited deterministic WHO-based test drafts and an adult high-BP review prompt, neither generated by the LLM nor clinically validated. It does not yet satisfy automatic longitudinal analysis, broad stage-specific recommendations, complete urgency assessment, or real clinical approval protocols. Evaluate each capability separately before claiming clinical functionality.

## Safety and data requirements

Use synthetic data. Preserve provenance and distinguish recorded facts from generated interpretations. Never let the model invent thresholds, fabricate history/results, confirm a diagnosis, prescribe, override deterministic rules, or bypass practitioner review. Apply authentication, role permissions, validation, audit logging, and approval gates to consequential actions.
