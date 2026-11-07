const base = process.env.HEALTHCAREAI2_URL ?? 'http://127.0.0.1:3000';
const encounterId = process.argv[2];
if (!encounterId) throw new Error('Pass the encounter ID to verify persistence after a service restart.');
const login = await fetch(`${base}/api/login`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ username: 'practitioner', password: process.env.DEMO_PRACTITIONER_PASSWORD ?? 'practitioner-demo' })
});
if (!login.ok) throw new Error(`Demo login failed: ${await login.text()}`);
const cookie = login.headers.getSetCookie()[0].split(';')[0];
const response = await fetch(`${base}/api/encounters/${encounterId}`, { headers: { cookie } });
if (!response.ok) throw new Error(`Persisted encounter was not available (${response.status}): ${await response.text()}`);
const detail = await response.json();
if (detail.latest_run?.status !== 'approved') throw new Error('Expected the persisted agent run to remain approved');
if (!detail.alerts.some((alert) => alert.status === 'approved' && alert.approval_status === 'approved')) throw new Error('Expected the approved alert to persist');
if (detail.tool_calls.length !== 3 || detail.tool_calls.some((tool) => tool.status !== 'succeeded')) throw new Error('Expected the three successful MCP calls to persist');
if (!detail.audit.some((event) => event.action === 'alert_approved_and_published')) throw new Error('Expected practitioner decision audit record to persist');
console.log(JSON.stringify({ encounter_id: encounterId, patient_id: detail.patient.id, run_status: detail.latest_run.status, alert_status: detail.alerts[0].status, mcp_calls: detail.tool_calls.length, audit_events: detail.audit.length, persistence: 'verified after service restart' }, null, 2));
