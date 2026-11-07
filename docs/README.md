# HealthcareAI2 documentation

HealthcareAI2 is a partially implemented synthetic-data clinical workflow assistance project. Qualified practitioners retain decision authority; this project is not a diagnostic or prescribing system.

## Status

The repository began empty. Phase 0 is complete. The Phase 1 vertical workflow now passes locally with a real open-weights model; 10 automated tests pass, and persistence after service restart was verified. Clean-environment reproducibility and later department workflows remain incomplete. See [EVALS](09_TESTING/EVALS.md) and [known limitations](11_MAINTENANCE/KNOWN_LIMITATIONS.md).

## Start here

- [Getting started](00_GETTING_STARTED/START_HERE.md) — current project status and implementation plan.
- [Requirements](01_PROJECT/REQUIREMENTS.md) — scope and acceptance gates extracted from the master prompt.
- [Architecture](03_ARCHITECTURE/ARCHITECTURE.md) — implemented components, safety boundaries, and gaps.
- [Implementation plan](11_MAINTENANCE/IMPLEMENTATION_PLAN.md) — ordered work and evidence required at each gate.
- [Known limitations](11_MAINTENANCE/KNOWN_LIMITATIONS.md) — verified gaps and constraints.

Workflow, data, frontend, submission, and maintenance documentation will be completed as those capabilities are implemented. Existing design docs distinguish current behavior from planned work.
