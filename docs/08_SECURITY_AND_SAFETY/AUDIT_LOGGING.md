# Audit and tool-call records

SQLite stores audit events with a monotonic sequence, unique event identifier, actor, action, resource type/id, JSON details, and UTC timestamp. The agent additionally stores each MCP tool input and output, start/finish timestamps, and success/failure. Agent runs persist deterministic evaluation and validated model output independently. Practitioner decision actor, decision, reason, and time are stored in the approval record and audit log.

The frontend encounter view exposes the latest run's MCP calls and audit events. Integration tests verify that alert creation and approval are persisted. The log is append-oriented by application convention but is not cryptographically tamper-evident, exported, or retained under a production policy.
