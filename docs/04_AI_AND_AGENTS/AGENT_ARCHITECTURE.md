# Agent architecture

The current LangGraph graph has four ordered nodes: `retrieve_context`, `deterministic_evaluation`, `model_explanation`, and `draft_alert`. It uses the custom MCP server for all three tool operations. The graph persists tool calls with JSON inputs, JSON outputs, start/end timestamps, and success/failure status.

The graph cannot directly approve or publish alerts. The final MCP tool only opens an approval request. A separate backend route checks the practitioner role and performs the approval transition. The graph and model have no credential for that route.

The context, deterministic evaluation, constrained local model, and alert-drafting nodes all completed in the local end-to-end run. The model returns only a validated history-context label and an allowed practitioner-review action. Alert text is generated from validated fields and deterministic results. Practitioner approval, all three MCP calls, and the audit timeline were verified in the same run and after service restart.
