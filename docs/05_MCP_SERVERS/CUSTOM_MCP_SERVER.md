# Custom HealthcareAI2 MCP server

## Runtime

`src/mcp-server.js` uses `@modelcontextprotocol/sdk` and Streamable HTTP on `127.0.0.1:3001/mcp`. The health route is `GET /health`. MCP requests require the `MCP_INTERNAL_TOKEN` bearer credential; the server is not bound to public interfaces. Handlers validate arguments using Zod, verify patient/encounter relationships, and return structured JSON as MCP text content.

## Tools

| Tool | Input | Behavior |
|---|---|---|
| `get_patient_context` | Patient and encounter UUIDs | Verifies the relationship and returns synthetic patient, encounter, current observations, and an explicit no-history note. |
| `evaluate_clinical_risk` | Encounter UUID and observations object | Runs protocol `synthetic-observation-completeness@0.1.0`. Despite the required tool name, it does not assign clinical risk. |
| `submit_clinical_alert` | Encounter UUID, run UUID, title, body, evidence list | Requires a persisted deterministic evaluation; atomically creates a pending alert and approval request. Repeated calls for the same run return the existing request. |

The tool layer does not approve or publish alerts. API authorization and human approval are enforced by the backend. Actual MCP context and evaluation calls have been verified in a live smoke; all three tool handlers and duplicate protection have automated MCP-protocol test coverage.
