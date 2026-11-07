const base = process.env.HEALTHCAREAI2_URL ?? 'http://127.0.0.1:3000';
const pageResponse = await fetch(base);
if (!pageResponse.ok || !(await pageResponse.text()).includes('Patient workflow')) throw new Error('Backend did not serve the connected workflow frontend');
const login = await fetch(`${base}/api/login`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ username: 'nurse', password: process.env.DEMO_NURSE_PASSWORD ?? 'nurse-demo' })
});
if (!login.ok) throw new Error(`Demo login failed (${login.status}): ${await login.text()}`);
const cookie = login.headers.getSetCookie()[0].split(';')[0];
const headers = { 'content-type': 'application/json', cookie };
const patientResponse = await fetch(`${base}/api/patients`, {
  method: 'POST', headers,
  body: JSON.stringify({ name: `Synthetic Integration ${new Date().toISOString()}`, date_of_birth: '1990-01-01', sex: 'unknown' })
});
if (!patientResponse.ok) throw new Error(`Patient registration failed: ${await patientResponse.text()}`);
const { patient } = await patientResponse.json();
const encounterResponse = await fetch(`${base}/api/patients/${patient.id}/encounters`, { method: 'POST', headers, body: '{}' });
if (!encounterResponse.ok) throw new Error(`Encounter creation failed: ${await encounterResponse.text()}`);
const { encounter } = await encounterResponse.json();
const observationResponse = await fetch(`${base}/api/encounters/${encounter.id}/observations`, {
  method: 'POST', headers,
  body: JSON.stringify({ temperature_c: 36.8, heart_rate_bpm: 72, respiratory_rate_per_min: 16, systolic_bp_mmhg: 118, diastolic_bp_mmhg: 76, oxygen_saturation_percent: 98 })
});
if (!observationResponse.ok) throw new Error(`Observation recording failed: ${await observationResponse.text()}`);
const workflowResponse = await fetch(`${base}/api/encounters/${encounter.id}/run`, { method: 'POST', headers, body: '{}' });
const workflow = await workflowResponse.json();
if (!workflowResponse.ok) {
  const detail = await (await fetch(`${base}/api/encounters/${encounter.id}`, { headers: { cookie } })).json();
  console.log(JSON.stringify({ registration: patientResponse.status, encounter: encounterResponse.status, observations: observationResponse.status, workflow: workflowResponse.status, error: workflow.error, model_output: detail.latest_run?.model_output, audit_actions: detail.audit.map(({ action }) => action) }, null, 2));
  throw new Error(`Agent workflow failed (${workflowResponse.status}): ${workflow.error}`);
}
const practitionerLogin = await fetch(`${base}/api/login`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ username: 'practitioner', password: process.env.DEMO_PRACTITIONER_PASSWORD ?? 'practitioner-demo' })
});
if (!practitionerLogin.ok) throw new Error(`Practitioner login failed: ${await practitionerLogin.text()}`);
const practitionerCookie = practitionerLogin.headers.getSetCookie()[0].split(';')[0];
const approvalResponse = await fetch(`${base}/api/approvals/${workflow.alert.approval_id}`, {
  method: 'POST', headers: { 'content-type': 'application/json', cookie: practitionerCookie }, body: JSON.stringify({ decision: 'approve' })
});
if (!approvalResponse.ok) throw new Error(`Practitioner approval failed (${approvalResponse.status}): ${await approvalResponse.text()}`);
const approval = await approvalResponse.json();
const detailResponse = await fetch(`${base}/api/encounters/${encounter.id}`, { headers: { cookie } });
const detail = await detailResponse.json();
const duplicate = await fetch(`${base}/api/encounters/${encounter.id}/run`, { method: 'POST', headers, body: '{}' });
const expectedTools = ['get_patient_context', 'evaluate_clinical_risk', 'submit_clinical_alert'];
if (detail.tool_calls.length !== expectedTools.length || detail.tool_calls.some((call, index) => call.tool_name !== expectedTools[index] || call.status !== 'succeeded')) throw new Error('Expected three ordered, successful, persisted MCP tool calls');
if (workflow.evaluation.clinical_risk_classification !== null || workflow.evaluation.status !== 'not_clinically_assessed') throw new Error('Deterministic protocol produced an unexpected clinical classification');
if (workflow.model_output.history_context !== 'none_recorded' || workflow.model_output.requested_action !== 'practitioner_review') throw new Error('Model returned an unexpected structured action/context label');
if (Object.hasOwn(workflow.model_output, 'clinical_risk_classification')) throw new Error('Model output included a prohibited clinical classification');
if (workflow.alert.status !== 'pending_approval' || approval.status !== 'approved') throw new Error('Approval gate did not transition from pending to approved');
const requiredAudit = ['model_invocation_started', 'model_output_validated', 'agent_run_completed', 'alert_approved_and_published'];
if (requiredAudit.some((action) => !detail.audit.some((event) => event.action === action))) throw new Error('Expected model and practitioner actions in the audit timeline');
if (duplicate.status !== 409) throw new Error('Duplicate workflow execution was not prevented');
console.log(JSON.stringify({
  registration: patientResponse.status,
  encounter: encounterResponse.status,
  observations: observationResponse.status,
  workflow: workflowResponse.status,
  run_id: workflow.run_id,
  model_output: workflow.model_output,
  deterministic_evaluation: workflow.evaluation,
  approval: { http_status: approvalResponse.status, status: approval.status },
  duplicate_workflow_status: duplicate.status,
  patient_id: patient.id,
  encounter_id: encounter.id,
  tool_calls: detail.tool_calls.map(({ tool_name, status, output }) => ({ tool_name, status, output })),
  audit_actions: detail.audit.map(({ action }) => action)
}, null, 2));
if (!detailResponse.ok) throw new Error(`Encounter retrieval failed: ${JSON.stringify(detail)}`);
if (approval.status !== 'approved' || duplicate.status !== 409) throw new Error('Approval or duplicate prevention did not match expected state');
