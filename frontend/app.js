const $ = (selector) => document.querySelector(selector);
let activeUser = null;
let selectedRecord = null;
let toastTimer;
let visitsRefreshTimer;
const approvedNurseReviews = new Set();
const roleNames = { attendant: 'Attendant', nurse: 'Nurse', doctor: 'Doctor', laboratory: 'Laboratory', pharmacist: 'Pharmacist', practitioner: 'Practitioner' };
const stageNames = { nurse_vitals: 'Nurse observations', doctor_initial: 'Doctor first visit', lab_results: 'Laboratory results', doctor_results: 'Doctor results visit', pharmacy: 'Pharmacy' };

function notify(message, error = false) {
  const toast = $('#toast'); toast.textContent = message; toast.classList.toggle('error', error); toast.classList.remove('hidden');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.add('hidden'), 4500);
}
async function request(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { ...(options.body ? { 'content-type': 'application/json' } : {}), ...options.headers } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }
function showSignedIn(user) {
  activeUser = user;
  $('#user-label').textContent = user.username;
  $('#logout').classList.remove('hidden'); $('#login-card').classList.add('hidden'); $('#department-app').classList.remove('hidden');
  $('#page-title').textContent = `${roleNames[user.role] ?? user.role} workspace`;
  $('#page-subtitle').textContent = roleSubtitle(user.role);
  renderRolePanel(); renderPatientPanel();
  $('#attendant-nav').classList.toggle('hidden', user.role !== 'attendant');
  if (user.role === 'attendant') setAttendantPage(location.hash === '#visits' ? 'visits' : 'registration', false);
}
function roleSubtitle(role) {
  return ({ attendant: 'Register patients and find existing records.', nurse: 'Select a registered patient and record blood pressure, temperature, and weight.', doctor: 'Review the patient journey and record consultation decisions.', laboratory: 'Review requested tests and enter samples and results.', pharmacist: 'Review medication orders and record dispensing and counseling.', practitioner: 'Review legacy workflow alerts.' })[role] ?? '';
}
function renderRolePanel() {
  const panel = $('#role-panel');
  if (activeUser.role === 'attendant') {
    panel.innerHTML = `<div class="card-heading"><div><span class="step">PATIENT REGISTRATION</span><h2>Register a patient</h2><p>A visit record is opened automatically. No encounter number is needed at this desk.</p></div></div>
      <form id="registration-form" class="stack-form"><label>Patient full name<input name="name" required maxlength="160" placeholder="Patient name"></label><div class="form-grid two-col"><label>Date of birth<input name="date_of_birth" type="date" required></label><label>Age (years)<input name="age" type="number" min="0" max="130" readonly placeholder="Calculated from date of birth"></label><label>Sex<select name="sex"><option value="female">Female</option><option value="male">Male</option></select></label></div><button class="primary-button">Register patient</button></form><div id="role-result" class="result-line">Search for an existing patient before creating a new record.</div>`;
    $('#registration-form').addEventListener('submit', registerPatient);
    $('#registration-form [name="date_of_birth"]').addEventListener('input', updateRegistrationAge);
  } else if (activeUser.role === 'practitioner') {
    panel.innerHTML = `<div class="card-heading"><div><span class="step">LEGACY REVIEW</span><h2>Practitioner review</h2><p>The original completeness workflow remains available through the previous demo API. Department screens are focused on the synthetic journey.</p></div></div>`;
  } else {
    panel.innerHTML = `<div class="card-heading"><div><span class="step">${escapeHtml(roleNames[activeUser.role].toUpperCase())} WORK AREA</span><h2>${escapeHtml(roleNames[activeUser.role])} patient tasks</h2><p>Search by patient name, select a record, and complete the available stage.</p></div></div><div id="role-result" class="result-line">Select a patient to continue.</div>`;
  }
}
function renderPatientPanel() {
  if (activeUser.role === 'nurse') {
    $('#patient-panel').classList.add('hidden');
    $('.role-layout').classList.add('nurse-layout');
    $('#nurse-queue').classList.remove('hidden');
    loadNurseQueue();
    return;
  }
  $('.role-layout').classList.remove('nurse-layout');
  $('#patient-panel').classList.remove('hidden');
  $('#nurse-queue').classList.add('hidden');
  $('#patient-panel').innerHTML = `<div class="card-heading"><div><span class="step">PATIENT LOOKUP</span><h2>Search registered patients</h2><p>Enter at least two characters, then open a visit from the result.</p></div></div><label>Patient name<input id="patient-search" autocomplete="off" placeholder="Search by name"></label><div id="search-results" class="patient-results"></div>`;
  let debounce;
  $('#patient-search').addEventListener('input', () => {
    clearTimeout(debounce);
    const query = $('#patient-search').value.trim();
    debounce = setTimeout(() => searchPatients(query), 200);
  });
  if (activeUser.role === 'attendant') loadTodayVisits();
}
async function loadNurseQueue() {
  const panel = $('#nurse-queue');
  if (!panel || activeUser?.role !== 'nurse') return;
  try {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date(start); end.setDate(end.getDate() + 1);
    const query = new URLSearchParams({ start: start.toISOString(), end: end.toISOString() });
    const { visits } = await request(`/api/attendant/today-visits?${query}`);
    const enrichedVisits = await Promise.all(visits.map(async (visit) => {
      const patientRecord = await request(`/api/patients/${visit.patient_id}/record`);
      const encounter = patientRecord.encounters.find((item) => item.id === visit.id);
      const nurseStage = encounter?.stages.find((item) => item.stage === 'nurse_vitals');
      return { ...visit, nurse_vitals_recorded: Boolean(nurseStage), risk_level: nurseStage ? nurseRiskLevel(visit.date_of_birth, nurseStage.data) : null };
    }));
    const patients = enrichedVisits.filter((visit) => !visit.nurse_vitals_recorded);
    const recorded = enrichedVisits.filter((visit) => visit.nurse_vitals_recorded);
    panel.innerHTML = `<div class="card-heading"><div><span class="step">NURSE WORKLIST</span><h2>Patient observations</h2><p>Record vital signs for new visits, then review or edit saved records.</p></div><button type="button" class="secondary-button refresh-nurse-queue">Refresh</button></div><section class="nurse-list-section"><div class="section-title"><div><span class="step">TO RECORD</span><h2>New visit patients</h2></div></div>${nurseVisitTable(patients, false)}</section><section class="nurse-list-section"><div class="section-title"><div><span class="step">RECORDED</span><h2>Patients with recorded vitals</h2></div></div>${nurseVisitTable(recorded, true)}</section>`;
    panel.querySelector('.refresh-nurse-queue')?.addEventListener('click', loadNurseQueue);
    panel.querySelectorAll('.select-nurse-patient, .edit-nurse-patient').forEach((button) => button.addEventListener('click', () => selectPatient(button.dataset.patient, button.dataset.encounter)));
    panel.querySelectorAll('.approve-nurse-review').forEach((button) => button.addEventListener('click', () => {
      approvedNurseReviews.add(button.dataset.encounter);
      button.textContent = 'Approved';
      button.classList.add('approved');
      button.disabled = true;
    }));
  } catch (error) { notify(error.message, true); }
}
function nurseRiskLevel(dateOfBirth, vitals) {
  const age = ageFromDob(dateOfBirth);
  const adult = typeof age === 'number' && age >= 18;
  const highTemperature = vitals.temperature_c < 36 || vitals.temperature_c > 39;
  const highAdultBp = adult && (vitals.systolic_bp_mmhg >= 180 || vitals.diastolic_bp_mmhg >= 120);
  if (highTemperature || highAdultBp) return 'High';
  const raisedTemperature = vitals.temperature_c >= 38;
  const raisedAdultBp = adult && (vitals.systolic_bp_mmhg >= 140 || vitals.diastolic_bp_mmhg >= 90);
  if (raisedTemperature || raisedAdultBp) return 'Medium';
  return 'Normal';
}
function nurseVisitTable(visits, recorded) {
  return `<div class="table-scroll"><table class="visits-table"><thead><tr><th>Patient name</th><th>Date of birth</th><th>Age</th><th>Sex</th><th>Visit opened</th><th>Status</th>${recorded ? '<th>Risk level</th><th>Action</th><th>Approval</th>' : '<th></th>'}</tr></thead><tbody>${visits.length ? visits.map((patient) => `<tr><td>${escapeHtml(patient.name)}</td><td>${escapeHtml(patient.date_of_birth)}</td><td>${ageFromDob(patient.date_of_birth)}</td><td>${escapeHtml(patient.sex)}</td><td>${escapeHtml(new Date(patient.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }))}</td><td><span class="visit-status ${recorded ? 'closed' : 'open'}">${recorded ? 'Recorded' : 'To record'}</span></td>${recorded ? `<td><span class="risk-level risk-${String(patient.risk_level ?? 'Normal').toLowerCase()}">${escapeHtml(patient.risk_level ?? 'Normal')}</span></td>` : ''}<td><button type="button" class="secondary-button ${recorded ? 'edit-nurse-patient' : 'select-nurse-patient'}" data-patient="${escapeHtml(patient.patient_id)}" data-encounter="${escapeHtml(patient.id)}">${recorded ? 'View / edit' : 'Record vitals'}</button></td>${recorded ? `<td><button type="button" class="secondary-button approve-nurse-review ${approvedNurseReviews.has(patient.id) ? 'approved' : ''}" data-encounter="${escapeHtml(patient.id)}" ${approvedNurseReviews.has(patient.id) ? 'disabled' : ''}>${approvedNurseReviews.has(patient.id) ? 'Approved' : 'Approve'}</button></td>` : ''}</tr>`).join('') : `<tr><td colspan="${recorded ? 9 : 7}" class="empty-visits">${recorded ? 'No observations have been saved today.' : 'No new visits are waiting for observations.'}</td></tr>`}</tbody></table></div>`;
}
async function searchPatients(query) {
  const target = $('#search-results');
  if (!target) return;
  if (query.length < 2) { target.innerHTML = ''; return; }
  try {
    const { patients } = await request(`/api/patients?q=${encodeURIComponent(query)}`);
    target.innerHTML = patients.length ? patients.map((patient) => activeUser.role === 'attendant'
      ? `<div class="patient-option"><span><strong>${escapeHtml(patient.name)}</strong><small>${escapeHtml(patient.date_of_birth)} · ${escapeHtml(patient.sex)}</small></span><button class="secondary-button open-visit-button" type="button" data-patient="${escapeHtml(patient.id)}">Open new visit</button></div>`
      : `<button class="patient-option" type="button" data-patient="${escapeHtml(patient.id)}"><strong>${escapeHtml(patient.name)}</strong><small>${escapeHtml(patient.date_of_birth)} · ${escapeHtml(patient.sex)} · ${patient.latest_encounter_id ? 'Visit on file' : 'No visit yet'}</small></button>`).join('') : '<div class="result-line">No matching patient found.</div>';
    target.querySelectorAll('[data-patient]').forEach((button) => button.addEventListener('click', () => activeUser.role === 'attendant' ? openNewVisit(button.dataset.patient) : selectPatient(button.dataset.patient)));
  } catch (error) { notify(error.message, true); }
}
function updateRegistrationAge() {
  const dobValue = $('#registration-form [name="date_of_birth"]').value;
  const ageField = $('#registration-form [name="age"]');
  if (!dobValue) { ageField.value = ''; return; }
  const dob = new Date(`${dobValue}T00:00:00`), today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  if (today.getMonth() < dob.getMonth() || (today.getMonth() === dob.getMonth() && today.getDate() < dob.getDate())) age--;
  ageField.value = age >= 0 ? age : '';
}
async function loadTodayVisits() {
  const panel = $('#today-visits');
  if (!panel || activeUser?.role !== 'attendant') return;
  try {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date(start); end.setDate(end.getDate() + 1);
    const query = new URLSearchParams({ start: start.toISOString(), end: end.toISOString() });
    const { visits } = await request(`/api/attendant/today-visits?${query}`);
    panel.innerHTML = `<div class="card-heading"><div><span class="step">TODAY</span><h2>New visit patients</h2><p>${visits.length} visit(s) opened today.</p></div><button type="button" class="secondary-button refresh-visits">Refresh</button></div><div class="table-scroll"><table class="visits-table"><thead><tr><th>Patient name</th><th>Date of birth</th><th>Age</th><th>Sex</th><th>Visit opened</th><th>Status</th></tr></thead><tbody>${visits.length ? visits.map((visit) => `<tr><td>${escapeHtml(visit.name)}</td><td>${escapeHtml(visit.date_of_birth)}</td><td>${ageFromDob(visit.date_of_birth)}</td><td>${escapeHtml(visit.sex)}</td><td>${escapeHtml(new Date(visit.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))}</td><td><span class="visit-status ${visit.status === 'complete' ? 'closed' : 'open'}">${visit.status === 'complete' ? 'Closed' : 'Open'}</span></td></tr>`).join('') : '<tr><td colspan="6" class="empty-visits">No new visits opened today.</td></tr>'}</tbody></table></div>`;
    panel.querySelector('.refresh-visits')?.addEventListener('click', loadTodayVisits);
  } catch (error) { notify(error.message, true); }
}
function setAttendantPage(page, updateHash = true) {
  const visitsPage = page === 'visits';
  document.querySelector('.role-layout')?.classList.toggle('hidden', visitsPage);
  $('#today-visits')?.classList.toggle('hidden', !visitsPage);
  $('#attendant-nav')?.querySelectorAll('[data-attendant-page]').forEach((button) => button.classList.toggle('active', button.dataset.attendantPage === page));
  if (updateHash) history.replaceState(null, '', visitsPage ? '#visits' : location.pathname);
  clearInterval(visitsRefreshTimer);
  visitsRefreshTimer = visitsPage ? setInterval(() => { if (!document.hidden) loadTodayVisits(); }, 15000) : null;
  if (visitsPage) loadTodayVisits();
}
$('#attendant-nav').addEventListener('click', (event) => {
  const button = event.target.closest('[data-attendant-page]');
  if (button) setAttendantPage(button.dataset.attendantPage);
});
function ageFromDob(value) {
  const dob = new Date(`${value}T00:00:00`), today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  if (today.getMonth() < dob.getMonth() || (today.getMonth() === dob.getMonth() && today.getDate() < dob.getDate())) age--;
  return age >= 0 ? age : '—';
}
async function openNewVisit(patientId) {
  try {
    await request(`/api/patients/${patientId}/encounters`, { method: 'POST', body: '{}' });
    setAttendantPage('visits');
    await loadTodayVisits();
    notify('New visit opened and added to today’s visit list.');
  } catch (error) { notify(error.message, true); }
}
async function selectPatient(patientId, encounterId = null) {
  try {
    selectedRecord = await request(`/api/patients/${patientId}/record`);
    if (encounterId) {
      const index = selectedRecord.encounters.findIndex((encounter) => encounter.id === encounterId);
      if (index > 0) selectedRecord.encounters.unshift(selectedRecord.encounters.splice(index, 1)[0]);
    }
    const latest = selectedRecord.encounters[0];
    if (!latest && activeUser.role !== 'attendant') throw new Error('This patient has no visit record yet. Ask the attendant to register the visit.');
    if (activeUser.role === 'nurse') $('#patient-details').classList.add('hidden');
    else $('#patient-details').classList.remove('hidden');
    $('#agent-output').classList.add('hidden');
    if (activeUser.role !== 'nurse') renderPatientDetail();
    renderRoleAction();
    const stages = latestStages();
    const currentStage = activeUser.role === 'nurse' ? 'nurse_vitals'
      : activeUser.role === 'laboratory' ? 'lab_results'
        : activeUser.role === 'pharmacist' ? 'pharmacy'
          : activeUser.role === 'doctor' ? (stages.has('doctor_results') ? 'doctor_results' : 'doctor_initial') : null;
    const savedReview = currentStage ? stages.get(currentStage)?.data?._assistant_review : null;
    if (savedReview && activeUser.role !== 'nurse') renderAgentOutput(currentStage, savedReview, false);
  } catch (error) { notify(error.message, true); }
}
function latestEncounter() { return selectedRecord?.encounters?.[0] ?? null; }
function latestStages() { return new Map((latestEncounter()?.stages ?? []).map((stage) => [stage.stage, stage])); }
function renderPatientDetail() {
  if (!selectedRecord) return;
  const patient = selectedRecord.patient;
  $('#patient-details').innerHTML = `<div class="card-heading"><div><span class="step">SELECTED PATIENT</span><h2>${escapeHtml(patient.name)}</h2><p>${escapeHtml(patient.date_of_birth)} · ${escapeHtml(patient.sex)} · ${selectedRecord.encounters.length} recorded visit(s)</p></div></div>${activeUser.role === 'doctor' ? renderJourneySummary() : ''}`;
}
function renderJourneySummary() {
  const encounter = latestEncounter();
  if (!encounter) return '<p class="result-line">No visit data has been recorded.</p>';
  const fields = encounter.stages.map((stage) => `<div class="history-stage"><strong>${escapeHtml(stageNames[stage.stage] ?? stage.stage)}</strong><small>${escapeHtml(stage.recorded_by)} · ${escapeHtml(new Date(stage.recorded_at).toLocaleString())}</small><pre>${escapeHtml(JSON.stringify(Object.fromEntries(Object.entries(stage.data).filter(([key]) => !['_assistant_review', '_recommendation_review_input', 'recommendation_review_id'].includes(key))), null, 2))}</pre></div>`).join('');
  const older = selectedRecord.encounters.slice(1).map((visit) => `<div class="history-stage"><strong>Earlier visit · ${escapeHtml(new Date(visit.created_at).toLocaleDateString())}</strong>${visit.stages.map((stage) => `<small>${escapeHtml(stageNames[stage.stage] ?? stage.stage)}: ${escapeHtml(Object.entries(stage.data).filter(([key]) => !['_assistant_review', '_recommendation_review_input', 'recommendation_review_id'].includes(key)).map(([, value]) => String(value)).join(' · '))}</small>`).join('')}</div>`).join('');
  return `<div class="journey-summary"><h3>Current visit · ${escapeHtml(new Date(encounter.created_at).toLocaleDateString())}</h3>${fields || '<p class="result-line">No department entries yet.</p>'}<h3>Past visits</h3>${older || '<p class="result-line">No past visits recorded.</p>'}</div>`;
}
function renderRoleAction() {
  const target = $('#role-result');
  if (!target || !selectedRecord) return;
  const patient = selectedRecord.patient;
  const encounter = latestEncounter();
  const stages = latestStages();
  if (activeUser.role === 'attendant') {
    const alreadyOpen = encounter && !encounter.stages.length && Date.now() - Date.parse(encounter.created_at) < 5 * 60 * 1000;
    target.innerHTML = `Selected: <strong>${escapeHtml(patient.name)}</strong> · ${selectedRecord.encounters.length} visit(s) recorded.${alreadyOpen ? ' A new visit is open for the nurse.' : '<button id="open-visit" class="secondary-button">Open a new visit</button>'}`;
    $('#open-visit')?.addEventListener('click', async () => {
      try { await request(`/api/patients/${patient.id}/encounters`, { method: 'POST', body: '{}' }); await selectPatient(patient.id); notify('New visit opened for the nurse.'); }
      catch (error) { notify(error.message, true); }
    });
    return;
  }
  if (!encounter) { target.textContent = 'This patient has no visit record.'; return; }
  if (activeUser.role === 'nurse') {
    const saved = stages.get('nurse_vitals');
    target.innerHTML = `${saved ? `<div class="saved-data"><strong>Saved observations</strong><pre>${escapeHtml(JSON.stringify(Object.fromEntries(Object.entries(saved.data).filter(([key]) => key !== '_assistant_review')), null, 2))}</pre></div>` : ''}
      <form id="nurse-form" class="stack-form"><div class="form-grid two-col"><label>Systolic blood pressure <span class="unit">mmHg</span><input name="systolic_bp_mmhg" type="number" min="1" value="${escapeHtml(saved?.data?.systolic_bp_mmhg ?? '')}" required></label><label>Diastolic blood pressure <span class="unit">mmHg</span><input name="diastolic_bp_mmhg" type="number" min="1" value="${escapeHtml(saved?.data?.diastolic_bp_mmhg ?? '')}" required></label><label>Temperature <span class="unit">°C</span><input name="temperature_c" type="number" min="1" step="0.1" value="${escapeHtml(saved?.data?.temperature_c ?? '')}" required></label><label>Weight <span class="unit">kg</span><input name="weight_kg" type="number" min="1" step="0.1" value="${escapeHtml(saved?.data?.weight_kg ?? '')}" required></label></div><button class="primary-button">${saved ? 'Save changes' : 'Save observations'}</button></form>`;
    $('#nurse-form').addEventListener('submit', (event) => saveStage(event, 'nurse_vitals', ['systolic_bp_mmhg', 'diastolic_bp_mmhg', 'temperature_c', 'weight_kg'], true));
    return;
  }
  if (activeUser.role === 'doctor') {
    const initial = stages.get('doctor_initial');
    const results = stages.get('lab_results');
    if (!initial) {
      target.innerHTML = `<div class="section-title"><div><span class="step">FIRST VISIT</span><h2>Consultation and laboratory tests</h2></div></div><p class="result-line">Nurse observations: ${stages.has('nurse_vitals') ? escapeHtml(JSON.stringify(Object.fromEntries(Object.entries(stages.get('nurse_vitals').data).filter(([key]) => key !== '_assistant_review')))) : 'not recorded'}.</p><form id="doctor-initial-form" class="stack-form"><label>Symptoms as reported by the patient and observed by the doctor<textarea name="symptoms" rows="4" required></textarea></label><label>Clinician-suspected condition(s)<input name="suspected_conditions" required placeholder="For example: suspected malaria, suspected lower UTI"></label><label>Relevant history/risk context<textarea name="risk_factors" rows="2" placeholder="Document relevant prior UTI, pregnancy, immune/urinary history, or other context reviewed"></textarea></label><label>Examination notes<textarea name="exam_notes" rows="3"></textarea></label><label>Doctor's initial proposed tests<textarea name="test_request" rows="2" placeholder="Optional initial ideas; edit the final request after reviewing drafts"></textarea></label><button id="generate-test-draft" class="secondary-button">Save consultation notes and run test draft</button><div id="test-draft-output" class="hidden"></div><button id="save-doctor-initial" class="primary-button hidden" type="button">Save final tests and send to laboratory</button></form>`;
      $('#doctor-initial-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const values = Object.fromEntries(new FormData(form));
        try {
          const draft = await request(`/api/encounters/${encounter.id}/reviews/doctor_initial`, { method: 'POST', body: JSON.stringify(values) });
          const output = draft.output;
          $('#test-draft-output').classList.remove('hidden');
          $('#test-draft-output').innerHTML = `<div class="recommendation-panel"><strong>WHO-guideline draft · ${escapeHtml(output.status)}</strong><p>Retrieved ${draft.retrieved_prior_visit_count} previous visit(s). This rules-based draft is for clinician review; it does not diagnose.</p>${output.history_context.length ? `<div class="history-context"><strong>Past record facts reviewed</strong>${output.history_context.map((fact) => `<small>${escapeHtml(fact.visit_date)} · ${escapeHtml(fact.source_stage)} · ${escapeHtml(fact.recorded_facts.join('; '))}</small>`).join('')}</div>` : '<p class="result-line">No prior visit facts are recorded.</p>'}${output.recommendations.map((item, index) => `<label class="recommendation-item"><span><input type="checkbox" class="draft-test-option" data-index="${index}" checked> <strong>${escapeHtml(item.test)}</strong></span><small>${escapeHtml(item.reason)}</small><small><b>Based on:</b> ${escapeHtml(item.supporting_facts.join('; '))}</small><small><a href="${escapeHtml(item.source.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.source.title)}</a> · ${escapeHtml(item.source.version)}</small></label>`).join('')}${output.review_notes.map((note) => `<p class="result-line">${escapeHtml(note)}</p>`).join('')}<ul>${output.limitations.map((note) => `<li>${escapeHtml(note)}</li>`).join('')}</ul></div>`;
          $('#save-doctor-initial').classList.remove('hidden');
          $('#save-doctor-initial').onclick = async () => {
            const selectedDrafts = [...$('#test-draft-output').querySelectorAll('.draft-test-option:checked')].map((checkbox) => output.recommendations[Number(checkbox.dataset.index)].test);
            const baseTests = form.elements.test_request.value.trim();
            const tests = [...new Set([baseTests, ...selectedDrafts].filter(Boolean))].join('\n');
            if (!tests) { notify('Enter the doctor’s requested tests or select a draft suggestion.', true); return; }
            const saved = { symptoms: form.elements.symptoms.value.trim(), suspected_conditions: form.elements.suspected_conditions.value.trim(), risk_factors: form.elements.risk_factors.value.trim(), exam_notes: form.elements.exam_notes.value.trim(), test_request: tests, recommendation_review_id: draft.review_id };
            try {
              const result = await request(`/api/encounters/${encounter.id}/stages/doctor_initial`, { method: 'POST', body: JSON.stringify(saved) });
              await selectPatient(selectedRecord.patient.id);
              renderAgentOutput('doctor_initial', result.assistant_review);
              notify('Doctor review and editable test request sent to the laboratory.');
            } catch (error) { notify(error.message, true); }
          };
          notify('WHO-guideline draft generated for doctor review.');
        } catch (error) { notify(error.message, true); }
      });
    } else if (!results) {
      target.innerHTML = `<div class="saved-data"><strong>Requested tests</strong><p>${escapeHtml(initial.data.test_request)}</p><p class="result-line">Waiting for laboratory results.</p></div>`;
    } else {
      const current = stages.get('doctor_results');
      target.innerHTML = `<div class="section-title"><div><span class="step">RESULTS VISIT</span><h2>Review results and write medication order</h2></div></div><div class="saved-data"><strong>Laboratory results</strong><pre>${escapeHtml(JSON.stringify(Object.fromEntries(Object.entries(results.data).filter(([key]) => key !== '_assistant_review')), null, 2))}</pre></div><form id="doctor-results-form" class="stack-form"><label>Assessment<textarea name="assessment" rows="3" required>${escapeHtml(current?.data?.assessment ?? '')}</textarea></label><label>Medication order as decided by doctor<textarea name="medication_order" rows="4" required placeholder="Medicine, strength/form, quantity, and directions as prescribed by the doctor">${escapeHtml(current?.data?.medication_order ?? '')}</textarea></label><button class="primary-button">Save order and send to pharmacy</button></form>`;
      $('#doctor-results-form').addEventListener('submit', (event) => saveStage(event, 'doctor_results', ['assessment', 'medication_order']));
    }
    return;
  }
  if (activeUser.role === 'laboratory') {
    const requested = stages.get('doctor_initial');
    const saved = stages.get('lab_results');
    let requestedItems = (requested?.data?.test_request ?? '').split(/\n+/).map((item) => item.trim()).filter(Boolean);
    if (requestedItems.length <= 1 && requestedItems[0]?.includes(',')) requestedItems = requestedItems[0].split(/[,;]+/).map((item) => item.trim()).filter(Boolean);
    let priorResults = [];
    try { priorResults = JSON.parse(saved?.data?.results ?? '[]'); } catch {}
    target.innerHTML = `${requested ? `<div class="saved-data"><strong>Doctor's requested tests</strong><p>${escapeHtml(requested.data.test_request)}</p></div><form id="lab-form" class="stack-form"><div class="lab-tests">${requestedItems.map((item, index) => `<div class="lab-test-row" data-index="${index}"><strong>${escapeHtml(item)}</strong><label>Sample taken<input class="sample-value" required value="${escapeHtml(priorResults[index]?.sample ?? '')}" placeholder="Sample type"></label><label>Result<textarea class="result-value" rows="2" required placeholder="Enter this test result">${escapeHtml(priorResults[index]?.result ?? '')}</textarea></label></div>`).join('')}</div><label>Laboratory notes<textarea id="lab-notes" rows="2">${escapeHtml(saved?.data?.result_notes ?? '')}</textarea></label><button class="primary-button">Save all results and return to doctor</button></form>` : '<p class="result-line">No doctor test request has been received for this visit.</p>'}`;
    if (requested) $('#lab-form').addEventListener('submit', (event) => {
      const items = [...$('#lab-form').querySelectorAll('.lab-test-row')].map((element) => ({ test: element.querySelector('strong').textContent, sample: element.querySelector('.sample-value').value.trim(), result: element.querySelector('.result-value').value.trim() }));
      if (items.some((item) => !item.sample || !item.result)) { event.preventDefault(); notify('Enter a sample and result for every requested test.', true); return; }
      const fields = { tests_received: JSON.stringify(items.map((item) => item.test)), specimen: JSON.stringify(items.map((item) => item.sample)), results: JSON.stringify(items), result_notes: $('#lab-notes').value.trim() };
      saveStage(event, 'lab_results', Object.keys(fields), false, fields);
    });
    return;
  }
  if (activeUser.role === 'pharmacist') {
    const order = stages.get('doctor_results');
    const saved = stages.get('pharmacy');
    const orderedItems = (order?.data?.medication_order ?? '').split(/\n+/).map((item) => item.trim()).filter(Boolean);
    const savedRows = (() => { try { return JSON.parse(saved?.data?.dispensed ?? '[]'); } catch { return []; } })();
    target.innerHTML = `${order ? `<div class="saved-data"><strong>Doctor's medication order</strong><pre>${escapeHtml(order.data.medication_order)}</pre></div><form id="pharmacy-form" class="stack-form"><div class="medicine-rows">${orderedItems.map((item, index) => {
      const prior = savedRows[index] ?? {};
      return `<div class="medicine-row" data-index="${index}"><div><strong>${escapeHtml(item)}</strong><small>As written by the doctor</small></div><label>Availability<select class="medicine-availability"><option value="available" ${prior.availability === 'available' ? 'selected' : ''}>Available</option><option value="unavailable" ${prior.availability === 'unavailable' ? 'selected' : ''}>Unavailable</option></select></label><label>Quantity supplied<input class="medicine-quantity" value="${escapeHtml(prior.quantity ?? '')}" placeholder="As ordered"></label><label class="substitute-label ${prior.availability === 'unavailable' ? '' : 'hidden'}">Pharmacist selected alternative<input class="medicine-substitute" value="${escapeHtml(prior.substitute ?? '')}"></label></div>`;
    }).join('')}</div><label>Instructions explained to the patient<textarea name="instructions" rows="3" required>${escapeHtml(saved?.data?.instructions ?? '')}</textarea></label><label>Has the patient received the medicine?<select name="medicine_received" required><option value="">Confirm after handoff</option><option value="yes" ${saved?.data?.medicine_received === 'yes' ? 'selected' : ''}>Yes, medicine given to patient</option><option value="no" ${saved?.data?.medicine_received === 'no' ? 'selected' : ''}>No, medicine not received</option></select></label><button class="primary-button">Save dispensing and handoff</button></form>` : '<p class="result-line">No doctor medication order has been received.</p>'}`;
    if (order) {
      $('#pharmacy-form').querySelectorAll('.medicine-availability').forEach((select) => select.addEventListener('change', () => select.closest('.medicine-row').querySelector('.substitute-label').classList.toggle('hidden', select.value !== 'unavailable')));
      $('#pharmacy-form').addEventListener('submit', (event) => {
      const items = [...$('#pharmacy-form').querySelectorAll('.medicine-row')].map((element) => ({ ordered_item: element.querySelector('strong').textContent, availability: element.querySelector('.medicine-availability').value, quantity: element.querySelector('.medicine-quantity').value.trim(), substitute: element.querySelector('.medicine-substitute').value.trim() }));
      if (items.some((item) => item.availability === 'available' && !item.quantity || item.availability === 'unavailable' && !item.substitute)) { event.preventDefault(); notify('Enter the quantity supplied or the pharmacist-selected alternative for each medicine.', true); return; }
        const fields = { dispensed: JSON.stringify(items), substitutions: JSON.stringify(items.filter((item) => item.availability === 'unavailable')), instructions: new FormData(event.currentTarget).get('instructions'), medicine_received: new FormData(event.currentTarget).get('medicine_received') };
        saveStage(event, 'pharmacy', Object.keys(fields), false, fields);
      });
    }
  }
}
async function saveStage(event, stage, fields, numeric = false, override = null) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = override ?? Object.fromEntries(fields.map((field) => [field, new FormData(form).get(field)?.trim() ?? '']).filter(([, value]) => value !== ''));
  if (numeric) for (const key of Object.keys(data)) data[key] = Number(data[key]);
  try {
    const encounterId = latestEncounter().id;
    const result = await request(`/api/encounters/${encounterId}/stages/${stage}`, { method: 'POST', body: JSON.stringify(data) });
    if (stage === 'nurse_vitals') {
      approvedNurseReviews.delete(encounterId);
      selectedRecord = null;
      $('#role-result').textContent = 'Select a patient to continue.';
      $('#patient-details').classList.add('hidden');
      $('#agent-output').classList.add('hidden');
      await loadNurseQueue();
      notify('Vitals saved and reviewed. The patient is listed under Patients with recorded vitals.');
      return;
    }
    await selectPatient(selectedRecord.patient.id);
    renderAgentOutput(stage, result.assistant_review);
    notify(stage === 'pharmacy' ? (data.medicine_received === 'yes' ? 'Medicine handoff confirmed; the visit is closed.' : 'Dispensing saved; the visit remains open until medicine is received.') : 'Information saved and sent to the next department.');
  } catch (error) { notify(error.message, true); }
}
function renderAgentOutput(stage, review, shouldScroll = true) {
  const target = $('#agent-output'); target.classList.remove('hidden');
  const riskLevel = review?.risk_level ?? (review?.status === 'urgent_clinician_review_prompt' ? 'High' : 'Normal');
  target.classList.toggle('urgent-review', stage === 'nurse_vitals' && riskLevel === 'High');
  if (stage === 'nurse_vitals') {
    target.innerHTML = `<div class="card-heading"><div><span class="step">RISK LEVEL</span><h2 class="risk-level risk-${riskLevel.toLowerCase()}">${escapeHtml(riskLevel)}</h2></div></div>`;
  } else {
    target.innerHTML = `<div class="card-heading"><div><span class="step">WORKFLOW STATUS · ${escapeHtml(stageNames[stage] ?? stage)}</span><h2>${escapeHtml(review?.status ?? 'Saved')}</h2></div></div><p>${escapeHtml(review?.message ?? 'The entry has been saved to the patient record.')}</p>${review?.source ? `<p><a href="${escapeHtml(review.source.url)}" target="_blank" rel="noreferrer">${escapeHtml(review.source.title)}</a></p>` : ''}`;
  }
  if (shouldScroll) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
async function registerPatient(event) {
  event.preventDefault();
  const form = event.currentTarget; const values = Object.fromEntries(new FormData(form));
  try {
    const existing = await request(`/api/patients?q=${encodeURIComponent(values.name)}`);
    const exact = existing.patients.find((patient) => patient.name.trim().toLocaleLowerCase() === values.name.trim().toLocaleLowerCase() && patient.date_of_birth === values.date_of_birth);
    if (exact) { $('#role-result').innerHTML = `A matching record already exists for <strong>${escapeHtml(exact.name)}</strong>. Select it from search instead of registering another record.`; notify('Possible duplicate patient: select the existing record.', true); return; }
    const result = await request('/api/patients', { method: 'POST', body: JSON.stringify(values) });
    $('#role-result').innerHTML = `Registered <strong>${escapeHtml(result.patient.name)}</strong>. The visit has been opened for the nurse.`;
    form.reset();
    const search = $('#patient-search'); search.value = values.name; await searchPatients(values.name);
    await loadTodayVisits();
    notify('Patient registered and sent to the nurse queue.');
  } catch (error) { notify(error.message, true); }
}
$('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault(); const form = new FormData(event.currentTarget);
  try { showSignedIn(await request('/api/login', { method: 'POST', body: JSON.stringify({ username: form.get('username'), password: form.get('password') }) })); }
  catch (error) { notify(error.message, true); }
});
$('#logout').addEventListener('click', async () => { await request('/api/logout', { method: 'POST' }).catch(() => {}); location.reload(); });
request('/api/me').then(showSignedIn).catch(() => {});
