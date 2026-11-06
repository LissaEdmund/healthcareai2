# START HERE

## Current status

This repository is at Phase 0. It contains no application implementation yet. There is no runnable service, database schema, login, model integration, MCP server, frontend, startup command, or passing test suite. Do not treat the proposed architecture below as implemented functionality.

## What the project is intended to do

HealthcareAI2 is intended to coordinate clinical workflow information across a hospital encounter and help practitioners review relevant facts and proposed actions. It uses synthetic records for the demonstration. It does not replace clinicians, independently diagnose, or autonomously prescribe or dispense.

## Proposed architecture

The target design separates a web frontend, authenticated backend, relational database, custom MCP tools, an open-source orchestration layer, and a locally hosted open-weights model. A deterministic, versioned demonstration protocol evaluates observations before any model explanation is requested. Consequential actions require practitioner approval. Tool calls, model output, approvals, and execution outcomes are auditable.

```text
Practitioner UI -> Authenticated API -> Encounter/database
                                    -> deterministic protocol
                                    -> orchestrator -> custom MCP tools
                                                     -> local open-weights model
                                    -> approval gate -> audited action
```

Every arrow is a target, not a currently working service.

## Requirements and eventual commands

Exact prerequisites, environment variables, model preparation, database migrations, service commands, demo accounts, and troubleshooting steps cannot be stated until technologies are selected and implemented. See [implementation plan](../11_MAINTENANCE/IMPLEMENTATION_PLAN.md). The one-command startup requirement will only be marked verified after it has been run and all services and the synthetic workflow have been checked.

## How to use this guide

At present, there are no install, login, workflow, or test commands. Do not invent credentials or attempt to run the application. After Phase 1, this page will be updated with tested commands and the specific evidence available. Clean-environment reproducibility will be reported separately from local development verification.
