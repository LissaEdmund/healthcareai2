# Application architecture

**Status: local six-role workflow demo.** The application uses a Node.js HTTP server, a browser single-page interface, and SQLite persistence. The workflow covers registration, nursing observations, an initial doctor consultation, laboratory results, a second doctor review, and pharmacy dispensing. Demo logins are role-based local accounts, not production identity management.

## Components

1. **Frontend:** role-specific screens for attendant, nurse, doctor, laboratory, and pharmacist. The doctor screen supports both consultation stages.
2. **Backend/API:** validates role access and stage ordering, searches patients by name, persists encounter data, and invalidates later stages when an earlier stage is edited.
3. **Database:** stores patients, encounters, stage records, audit metadata, and clinician-reviewed agent draft records in SQLite.
4. **Recommendation rules:** deterministic, narrow WHO-based test suggestions and an adult very-high-blood-pressure review prompt. These are drafts and prompts, not diagnosis or a complete triage protocol.
5. **AI boundary:** the current six-stage workflow does not use the LLM to generate clinical recommendations. Existing model/MCP workflow components are separate from these deterministic rules.

## Patient journey

```text
Attendant registration -> Nurse observations -> Doctor consultation and test review
 -> Laboratory samples/results -> Doctor result review and medication order
 -> Pharmacist dispensing and completion
```

Each handoff is persisted with the acting demo account and timestamp. The doctor reviews AI-suggested tests and saves the final test list. Medication selection, dose, and substitution suggestions remain unavailable until a verified hospital formulary and the required patient-safety context are configured.

## Known scope

This is a local synthetic-data demonstration. See [known limitations](../11_MAINTENANCE/KNOWN_LIMITATIONS.md) and [clinical evaluation](../04_AI_AND_AGENTS/CLINICAL_EVALUATION.md) for the rule coverage and safety boundaries. Production identity, deployment, approved local protocols, and broader clinical validation remain outstanding.
