# Project overview

HealthcareAI2 is an agentic clinical workflow assistance project for synthetic hospital workflows, with attention to resource-constrained African hospital settings. The current implementation is limited to registration, observations, deterministic completeness evaluation, agent-drafted review alert, and practitioner approval. The rest of the patient journey is planned.

The platform is decision support. Recorded facts, patient reports, historical information, unverified results, model-generated interpretations, and practitioner decisions must remain distinguishable. Clinical decisions remain with qualified practitioners.

## Current state

The initial repository inspection on 2026-11-06 found no implementation. The current stack is Node.js 26, built-in SQLite, LangGraph.js, the official MCP TypeScript SDK, and Ollama HTTP inference. Ten automated tests and the complete local vertical workflow pass. The full hospital journey and clean-machine setup remain outstanding. See the architecture and test-results documents for evidence.
