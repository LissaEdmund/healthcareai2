const $ = (selector) => document.querySelector(selector);
let activePatient = null;
let activeEncounter = null;
let activeRole = null;
let latestApproval = null;
let toastTimer;

function notify(message, error = false) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.toggle('error', error);
  toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add('hidden'), 4500);
}
async function request(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { ...(options.body ? { 'content-type': 'application/json' } : {}), ...options.headers } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}
function showSignedIn(user) {
  activeRole = user.role;
  $('#user-label').textContent = `${user.username} · ${user.role}`;
  $('#logout').classList.remove('hidden');
  $('#login-card').classList.add('hidden');
  $('#app-workflow').classList.remove('hidden');
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

$('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    const user = await request('/api/login', { method: 'POST', body: JSON.stringify({ username: form.get('username'), password: form.get('password') }) });
    showSignedIn(user);
    notify(`Signed in as ${user.role}.`);
  } catch (error) { notify(error.message, true); }
});

$('#logout').addEventListener('click', async () => {
  await request('/api/logout', { method: 'POST' }).catch(() => {});
  location.reload();
});

$('#patient-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    const result = await request('/api/patients', { method: 'POST', body: JSON.stringify({ name: form.get('name'), date_of_birth: form.get('date_of_birth'), sex: form.get('sex') }) });
    activePatient = result.patient;
    const encounter = await request(`/api/patients/${activePatient.id}/encounters`, { method: 'POST', body: '{}' });
    activeEncounter = encounter.encounter;
    $('#patient-result').textContent = `Synthetic record ${activePatient.id.slice(0, 8)} created for ${activePatient.name}.`;
    $('#patient-result').classList.add('active');
    $('#encounter-result').textContent = `Encounter ${activeEncounter.id.slice(0, 8)} opened. Add observations to continue.`;
    $('#encounter-result').classList.add('active');
    $('#record-button').disabled = false;
    notify('Patient and encounter created.');
  } catch (error) { notify(error.message, true); }
});

$('#observations-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!activeEncounter) return;
  const values = {};
  for (const [key, value] of new FormData(event.currentTarget).entries()) if (value !== '') values[key] = Number(value);
  try {
    await request(`/api/encounters/${activeEncounter.id}/observations`, { method: 'POST', body: JSON.stringify(values) });
    $('#encounter-result').textContent = `Observations recorded. The completeness check will not classify clinical risk.`;
    $('#encounter-result').classList.add('active');
    $('#run-button').disabled = false;
    notify('Observations recorded.');
  } catch (error) { notify(error.message, true); }
});

$('#run-button').addEventListener('click', async () => {
  if (!activeEncounter) return;
  const button = $('#run-button');
  button.disabled = true;
  button.innerHTML = 'Running tools and model…';
  try {
    const result = await request(`/api/encounters/${activeEncounter.id}/run`, { method: 'POST', body: '{}' });
    latestApproval = result.alert.approval_id;
    $('#results').classList.remove('hidden');
    $('#evaluation-output').innerHTML = `<pre>${escapeHtml(JSON.stringify(result.evaluation, null, 2))}</pre>`;
    const model = result.model_output;
    $('#model-output').innerHTML = `<div class="explanation"><p><strong>Model:</strong> ${escapeHtml(model.model)}</p><p><strong>Observation completeness:</strong> ${escapeHtml(model.observation_completeness)}</p><p><strong>History context:</strong> ${escapeHtml(model.history_context)}</p><p><strong>Requested workflow action:</strong> ${escapeHtml(model.requested_action)}</p><p class="result-line">Constrained model output was checked against stored records. Alert wording is assembled from validated data.</p></div>`;
    $('#tool-count').textContent = `${result.context ? 1 : 0} context · 1 evaluation · 1 alert`;
    $('#tool-output').innerHTML = `<div class="tool-row"><div><strong>get_patient_context</strong><small>Patient history and encounter context retrieved through MCP.</small></div><span class="tool-state">Completed</span></div><div class="tool-row"><div><strong>evaluate_clinical_risk</strong><small>${escapeHtml(result.evaluation.protocol_id)} @ ${escapeHtml(result.evaluation.protocol_version)} · No clinical risk threshold.</small></div><span class="tool-state">Completed</span></div><div class="tool-row"><div><strong>submit_clinical_alert</strong><small>Created alert ${escapeHtml(result.alert.alert_id.slice(0, 8))} and approval request.</small></div><span class="tool-state">Pending review</span></div>`;
    renderApproval({ id: result.alert.approval_id, status: 'pending', alert_id: result.alert.alert_id, body: '' });
    $('#run-status').textContent = 'Awaiting practitioner review';
    await refreshEncounter();
    $('#results').scrollIntoView({ behavior: 'smooth', block: 'start' });
    notify('Workflow completed and approval requested.');
  } catch (error) {
    notify(error.message, true);
    button.disabled = false;
  } finally {
    button.innerHTML = 'Run workflow <span>→</span>';
  }
});

function renderApproval(approval) {
  const actions = activeRole === 'practitioner' && approval.status === 'pending'
    ? `<div class="approval-action"><button class="approve-button" data-decision="approve">Approve and publish alert</button><input id="reject-reason" placeholder="Reason required to reject"><button class="reject-button" data-decision="reject">Reject</button></div>`
    : '';
  $('#approval-status').textContent = approval.status === 'pending' ? 'Awaiting review' : approval.status;
  $('#approval-status').className = approval.status === 'pending' ? 'status-pending' : 'model-badge';
  $('#approval-output').innerHTML = `<div class="explanation"><p><strong>Draft alert:</strong> ${escapeHtml(approval.body || '')}</p><p>Approval ID ${escapeHtml(approval.id)}</p>${actions}</div>`;
  $('#approval-output').querySelectorAll('[data-decision]').forEach((button) => button.addEventListener('click', async () => {
    const decision = button.dataset.decision;
    const reason = $('#reject-reason')?.value;
    try {
      const output = await request(`/api/approvals/${approval.id}`, { method: 'POST', body: JSON.stringify({ decision, ...(decision === 'reject' ? { reason } : {}) }) });
      renderApproval({ ...approval, status: output.status });
      await refreshEncounter();
      notify(output.status === 'approved' ? 'Practitioner approved and published the alert.' : 'Alert rejected and recorded.');
    } catch (error) { notify(error.message, true); }
  }));
}

async function refreshEncounter() {
  if (!activeEncounter) return;
  const data = await request(`/api/encounters/${activeEncounter.id}`);
  if (data.alerts.length) {
    const alert = data.alerts[0];
    const original = $('#approval-output').textContent;
    renderApproval({ id: alert.approval_id, status: alert.approval_status, alert_id: alert.id, body: alert.body || original });
  }
  $('#audit-output').innerHTML = data.audit.map((event) => `<div class="audit-row"><div><strong>${escapeHtml(event.action)}</strong><small>${escapeHtml(event.actor)} · ${escapeHtml(event.resource_type)} ${escapeHtml(event.resource_id || '')}</small></div><span class="tool-state">${escapeHtml(new Date(event.created_at).toLocaleTimeString())}</span></div>`).join('') || '<div class="result-line">No audit events yet.</div>';
  if (data.tool_calls.length) {
    $('#tool-output').innerHTML = data.tool_calls.map((tool) => `<div class="tool-row"><div><strong>${escapeHtml(tool.tool_name)}</strong><small>Input: ${escapeHtml(JSON.stringify(tool.input))}<br>Output: ${escapeHtml(JSON.stringify(tool.output))}</small></div><span class="tool-state">${escapeHtml(tool.status)}</span></div>`).join('');
    $('#tool-count').textContent = `${data.tool_calls.length} audited MCP calls`;
  }
}

request('/api/me').then(showSignedIn).catch(() => {});
