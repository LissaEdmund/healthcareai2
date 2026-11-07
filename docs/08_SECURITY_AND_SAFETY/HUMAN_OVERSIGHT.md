# Human oversight and approval

The custom MCP tool creates a draft alert with `pending_approval` status. It cannot publish it. `POST /api/approvals/:id` requires an authenticated `practitioner` role; the `nurse` role receives 403. Approve changes the alert and request to `approved`, which publishes the alert in the encounter view. Reject requires a reason and records `rejected`. Repeated decisions receive 409.

The workflow idempotency record prevents starting another run against the same observation while an action is running, awaiting approval, or approved. The alert submission table prevents duplicate alerts for the same run. Rejected or failed runs can be retried.

Automated integration tests exercise nurse denial, practitioner approval and rejection, duplicate decision prevention, persisted status, and audit events. This is a local synthetic demo gate, not a production identity or approval system.
