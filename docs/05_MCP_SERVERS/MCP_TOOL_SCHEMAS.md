# MCP tool schema summary

All tool inputs are parsed by Zod in the custom MCP server and are also represented in the MCP tool list.

## `get_patient_context`

```json
{"patient_id":"<UUID>","encounter_id":"<UUID>"}
```

Both records must exist and the encounter must belong to the patient.

## `evaluate_clinical_risk`

```json
{"encounter_id":"<UUID>","observations":{"temperature_c":36.8,"heart_rate_bpm":72}}
```

The observation map accepts numbers and strings; the deterministic evaluator identifies nonnumeric values and missing required fields. No thresholds are configured.

## `submit_clinical_alert`

```json
{"encounter_id":"<UUID>","run_id":"<UUID>","title":"Practitioner review requested","body":"Please review the recorded synthetic information.","evidence":["protocol:synthetic-observation-completeness@0.1.0"]}
```

Title is limited to 120 characters, body to 2,000 characters, and evidence to 20 strings. A matching persisted evaluation is required. This action creates a pending approval request; approval is a separate role-protected API operation.
