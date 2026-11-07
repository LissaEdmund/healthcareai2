# First vertical workflow demonstration

1. Start services with `npm.cmd start` after Ollama and the configured model are prepared.
2. Open `http://127.0.0.1:3000` and sign in as `nurse`.
3. Enter synthetic patient details and register them; the app opens a linked encounter.
4. Record any or all of the six synthetic observation fields. The protocol reports missing/nonnumeric data only and does not assess clinical risk.
5. Select **Run workflow**. The graph retrieves context, invokes the deterministic protocol, calls the local model for a structured neutral draft, and creates a pending alert request.
6. Sign out, sign in as `practitioner`, review the draft and tool-call inputs/outputs, then approve or reject it. Rejection requires a reason.
7. Inspect persisted approval status and audit events in the result section.

The model-backed workflow was executed successfully locally. The alert is published only after practitioner approval. This demonstration does not establish clinical validity or clean-environment reproducibility.
