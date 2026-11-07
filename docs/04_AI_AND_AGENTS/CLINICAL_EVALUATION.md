# Clinical evaluation and LLM boundary

## Implemented protocol

`src/protocol.js` runs protocol `synthetic-observation-completeness` version `0.1.0`. It checks that six configured observation fields are present and numeric. It reports missing/invalid field names and a completeness rule identifier. It has no thresholds, abnormal ranges, combinations, or clinical risk classification; `clinical_risk_classification` is always `null`. This is a technical demonstration protocol, not an approved clinical protocol.

## Execution order

1. API validates the observation payload and persists it with actor and timestamp.
2. LangGraph calls MCP `get_patient_context`.
3. LangGraph calls MCP `evaluate_clinical_risk`; the MCP server invokes the deterministic function and returns its versioned result.
4. The result is persisted before model inference.
5. The local Ollama model receives retrieved context and the deterministic result and returns JSON constrained to history-context and practitioner-review action labels.
6. Extra keys such as risk classification, diagnosis, or prescription fail Zod validation. The deterministic result remains separately stored.
7. Backend alert wording is assembled from validated observation fields and deterministic results. Only after valid structured output does the graph call `submit_clinical_alert`, which creates a pending alert and approval request.
8. A practitioner must approve or reject through an authenticated API endpoint.

## Limits

The model cannot author free-text alert claims; schema validation blocks unrecognized fields and backend comparison checks its history label. The alert remains a synthetic review request until practitioner approval. Add claim-to-source validation before introducing model-authored prose, and an approved clinical protocol before representing clinical risk evaluation as available.

Automated tests verify rejection of risk classification, diagnosis, prescription, unsupported history, and unsupported action output. A successful local model-backed run is recorded in [EVALS.md](../09_TESTING/EVALS.md).
