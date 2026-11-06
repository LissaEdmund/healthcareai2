# Initial architecture

**Status: proposed, not implemented.** The repository baseline has no application code. Technology choices remain open until the first vertical slice is designed against the actual runtime constraints.

## Components

1. **Frontend:** shared authenticated workspace for patient and encounter information, workflow state, alert review, and approval decisions.
2. **Backend/API:** validates identity, role, inputs, workflow transitions, and output schemas; owns authorization and approval enforcement.
3. **Relational database:** canonical synthetic patients, encounters, observations, alerts, approvals, tool-call records, and append-oriented audit events.
4. **Deterministic evaluation engine:** executes only a documented, versioned synthetic demonstration protocol; returns explainable structured rule results.
5. **Custom MCP server:** exposes narrowly scoped, schema-validated patient-context, evaluation, and alert tools with permission checks.
6. **Borrowed MCP server:** a restricted, documented integration to be selected after dependency and licensing review.
7. **Orchestrator and open-weights model:** uses authorized tools and validated inputs; the model explains evidence and drafts suggestions but cannot set or alter deterministic risk results.
8. **Approval and audit:** backend-enforced practitioner review before consequential execution; records inputs, outputs, timestamps, actor, decision, and outcome.

## Mandatory ordering

```text
Validate observations -> retrieve authorized context -> deterministic evaluation
 -> validate protocol result -> model explanation/draft -> schema and evidence checks
 -> conflict detection -> practitioner approval -> idempotent execution -> audit/UI refresh
```

If the model conflicts with deterministic output, preserve the deterministic result, flag the conflict, and route it for practitioner review. The model must not have direct access to consequential execution tools.

## Decisions still open

Language/runtime, framework, database, identity approach, MCP transport and SDK, borrowed server, open-weights model, model serving runtime, deployment packaging, and frontend stack. These decisions will be recorded in `../11_MAINTENANCE/DECISIONS.md` before implementation depends on them.
