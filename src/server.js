import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { extname, isAbsolute, relative, resolve } from 'node:path';
import { db, row, rows, run, audit } from './db.js';
import { REQUIRED_OBSERVATIONS } from './protocol.js';
import { explainNurseVitalsReview, runWorkflow } from './orchestrator.js';
import { buildTestDraft } from './recommendations.js';

const host = process.env.HOST ?? '127.0.0.1';
const port = Number(process.env.PORT ?? 3000);
const sessionHours = 8;
const demoUsers = [
  { username: 'attendant', password: process.env.DEMO_ATTENDANT_PASSWORD ?? 'attendant-demo', role: 'attendant' },
  { username: 'nurse', password: process.env.DEMO_NURSE_PASSWORD ?? 'nurse-demo', role: 'nurse' },
  { username: 'doctor', password: process.env.DEMO_DOCTOR_PASSWORD ?? 'doctor-demo', role: 'doctor' },
  { username: 'laboratory', password: process.env.DEMO_LABORATORY_PASSWORD ?? 'laboratory-demo', role: 'laboratory' },
  { username: 'pharmacist', password: process.env.DEMO_PHARMACIST_PASSWORD ?? 'pharmacist-demo', role: 'pharmacist' },
  { username: 'practitioner', password: process.env.DEMO_PRACTITIONER_PASSWORD ?? 'practitioner-demo', role: 'practitioner' }
];
const workflowStages = [
  { id: 'nurse_vitals', role: 'nurse', label: 'Nurse · vital signs' },
  { id: 'doctor_initial', role: 'doctor', label: 'Doctor · first visit' },
  { id: 'lab_results', role: 'laboratory', label: 'Laboratory · samples and results' },
  { id: 'doctor_results', role: 'doctor', label: 'Doctor · results visit' },
  { id: 'pharmacy', role: 'pharmacist', label: 'Pharmacy · dispensing' }
];
const frontendRoot = resolve('frontend');

function json(res, status, payload, extraHeaders = {}) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extraHeaders });
  res.end(JSON.stringify(payload));
}
function cookie(req, key) {
  const entry = (req.headers.cookie ?? '').split(';').map((part) => part.trim()).find((part) => part.startsWith(`${key}=`));
  return entry ? decodeURIComponent(entry.slice(key.length + 1)) : null;
}
function hash(value) { return createHash('sha256').update(value).digest('hex'); }
function secureEquals(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
function auth(req) {
  const token = cookie(req, 'hcai_session');
  if (!token) return null;
  const session = row('SELECT username, role, expires_at FROM sessions WHERE token_hash = ?', hash(token));
  if (!session || Date.parse(session.expires_at) <= Date.now()) return null;
  return session;
}
function requireRole(session, roles) {
  if (!session) throw Object.assign(new Error('Sign in to continue'), { status: 401 });
  if (!roles.includes(session.role)) throw Object.assign(new Error('Your account cannot perform this action'), { status: 403 });
}
async function body(req) {
  let data = '';
  for await (const chunk of req) {
    data += chunk;
    if (data.length > 65536) throw Object.assign(new Error('Request body is too large'), { status: 413 });
  }
  if (!data) return {};
  try { return JSON.parse(data); } catch { throw Object.assign(new Error('Request body must be valid JSON'), { status: 400 }); }
}
function validString(value, max = 200) { return typeof value === 'string' && value.trim().length > 0 && value.length <= max; }
function encounterSnapshot(id) {
  const encounter = row('SELECT e.*, p.name, p.date_of_birth, p.sex FROM encounters e JOIN patients p ON p.id = e.patient_id WHERE e.id = ?', id);
  if (!encounter) return null;
  const latestRun = row('SELECT * FROM agent_runs WHERE encounter_id = ? ORDER BY created_at DESC LIMIT 1', id);
  const alerts = rows(`SELECT a.*, ap.id AS approval_id, ap.status AS approval_status, ap.decided_by, ap.decision_reason
    FROM alerts a LEFT JOIN approvals ap ON ap.alert_id = a.id WHERE a.encounter_id = ? ORDER BY a.created_at DESC`, id).map((a) => ({ ...a, evidence: JSON.parse(a.evidence) }));
  return {
    encounter: { id: encounter.id, patient_id: encounter.patient_id, status: encounter.status, created_at: encounter.created_at },
    patient: { id: encounter.patient_id, name: encounter.name, date_of_birth: encounter.date_of_birth, sex: encounter.sex },
    observations: rows('SELECT id, payload, recorded_by, created_at FROM observations WHERE encounter_id = ? ORDER BY created_at', id).map((o) => ({ id: o.id, ...JSON.parse(o.payload), recorded_by: o.recorded_by, recorded_at: o.created_at })),
    stages: rows(`SELECT stage, payload, recorded_by, created_at FROM encounter_stages WHERE encounter_id = ? ORDER BY CASE stage
      WHEN 'nurse_vitals' THEN 0 WHEN 'doctor_initial' THEN 1 WHEN 'lab_results' THEN 2 WHEN 'doctor_results' THEN 3 WHEN 'pharmacy' THEN 4 ELSE 5 END`, id).map((s) => ({ stage: s.stage, data: JSON.parse(s.payload), recorded_by: s.recorded_by, recorded_at: s.created_at })),
    latest_run: latestRun ? { id: latestRun.id, status: latestRun.status, evaluation: latestRun.evaluation && JSON.parse(latestRun.evaluation), model_output: latestRun.model_output && JSON.parse(latestRun.model_output) } : null,
    alerts,
    tool_calls: latestRun ? rows('SELECT id, tool_name, input_json, output_json, status, started_at, finished_at FROM tool_calls WHERE run_id = ? ORDER BY started_at', latestRun.id).map((t) => ({ ...t, input: JSON.parse(t.input_json), output: t.output_json ? JSON.parse(t.output_json) : null, input_json: undefined, output_json: undefined })) : [],
    audit: rows(`SELECT sequence, actor, action, resource_type, resource_id, details, created_at FROM audit_log
      WHERE resource_id = ?
        OR resource_id IN (SELECT id FROM agent_runs WHERE encounter_id = ?)
        OR resource_id IN (SELECT id FROM tool_calls WHERE run_id IN (SELECT id FROM agent_runs WHERE encounter_id = ?))
        OR resource_id IN (SELECT id FROM alerts WHERE encounter_id = ?)
        OR details LIKE ?
      ORDER BY sequence`, id, id, id, id, `%${id}%`).map((event) => ({ ...event, details: JSON.parse(event.details) }))
  };
}
function patientRecord(patientId) {
  const patient = row('SELECT id, name, date_of_birth, sex, created_at FROM patients WHERE id = ?', patientId);
  if (!patient) return null;
  const encounters = rows('SELECT id, status, created_at FROM encounters WHERE patient_id = ? ORDER BY created_at DESC', patientId).map((encounter) => ({
    ...encounter,
    observations: rows('SELECT payload, recorded_by, created_at FROM observations WHERE encounter_id = ? ORDER BY created_at', encounter.id).map((item) => ({ ...JSON.parse(item.payload), recorded_by: item.recorded_by, recorded_at: item.created_at })),
    stages: rows(`SELECT stage, payload, recorded_by, created_at FROM encounter_stages WHERE encounter_id = ? ORDER BY CASE stage
      WHEN 'nurse_vitals' THEN 0 WHEN 'doctor_initial' THEN 1 WHEN 'lab_results' THEN 2 WHEN 'doctor_results' THEN 3 WHEN 'pharmacy' THEN 4 ELSE 5 END`, encounter.id).map((item) => ({ stage: item.stage, data: JSON.parse(item.payload), recorded_by: item.recorded_by, recorded_at: item.created_at }))
  }));
  return { patient, encounters };
}
function nurseVitalsRiskLevel(dateOfBirth, vitals) {
  const dob = new Date(`${dateOfBirth}T00:00:00Z`);
  const today = new Date();
  let ageYears = today.getUTCFullYear() - dob.getUTCFullYear();
  if (today.getUTCMonth() < dob.getUTCMonth() || (today.getUTCMonth() === dob.getUTCMonth() && today.getUTCDate() < dob.getUTCDate())) ageYears--;

  const temp = vitals.temperature_c;
  const sys = vitals.systolic_bp_mmhg;
  const dia = vitals.diastolic_bp_mmhg;

  // --- HIGH risk check (evaluated first) ---
  if (ageYears >= 0 && ageYears <= 2) {
    if (temp >= 38 || temp < 35) {
      return 'High';
    }
    if (sys > 115 || dia > 80 || sys < 60 || dia < 30) {
      return 'High';
    }
  } else if (ageYears >= 3 && ageYears <= 10) {
    if (temp >= 38) {
      return 'High';
    }
    if (sys >= 130 || dia >= 80 || sys < 90 || dia < 55) {
      return 'High';
    }
  } else if (ageYears >= 11 && ageYears <= 65) {
    if (temp >= 38) {
      return 'High';
    }
    if (sys >= 180 || dia >= 120 || sys < 90 || dia < 60) {
      return 'High';
    }
  } else if (ageYears > 65) {
    if (temp >= 38 || temp < 35) {
      return 'High';
    }
    if (sys >= 180 || dia >= 120 || sys < 90 || dia < 60) {
      return 'High';
    }
  }

  // --- MEDIUM risk check ---
  if (ageYears >= 0 && ageYears <= 2) {
    const medTemp = temp >= 37.5 && temp <= 38.9;
    const medBp = (sys > 105 || dia > 70) || (sys < 60 || dia < 30);
    if (medTemp || medBp) return 'Medium';
  } else if (ageYears >= 3 && ageYears <= 10) {
    const medTemp = temp >= 38 && temp <= 39.4;
    const medBp = ((sys >= 115 && sys <= 129) || (dia >= 75 && dia <= 79)) || (sys < 90 || dia < 55);
    if (medTemp || medBp) return 'Medium';
  } else if (ageYears >= 11 && ageYears <= 65) {
    const medTemp = temp >= 38 && temp <= 39;
    const medBp = ((sys >= 120 && sys <= 179) || (dia >= 80 && dia <= 119)) || (sys < 90 || dia < 60);
    if (medTemp || medBp) return 'Medium';
  } else if (ageYears > 65) {
    const medTemp = temp >= 37 && temp <= 38.5;
    const medBp = ((sys >= 120 && sys <= 179) || (dia >= 80 && dia <= 119)) || (sys < 90 || dia < 60);
    if (medTemp || medBp) return 'Medium';
  }

  // --- NORMAL (all values fall within normal ranges) ---
  return 'Normal';
}

async function api(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/me') {
    const session = auth(req);
    if (!session) return json(res, 401, { error: 'Sign in to continue' });
    return json(res, 200, { username: session.username, role: session.role });
  }
  if (req.method === 'POST' && url.pathname === '/api/login') {
    const input = await body(req);
    if (!validString(input.username, 50) || !validString(input.password, 200)) return json(res, 400, { error: 'Username and password are required' });
    const user = demoUsers.find((candidate) => secureEquals(candidate.username, input.username) && secureEquals(candidate.password, input.password));
    if (!user) return json(res, 401, { error: 'Invalid demo account credentials' });
    const token = randomUUID() + randomUUID();
    const now = new Date();
    const expires = new Date(now.getTime() + sessionHours * 60 * 60 * 1000).toISOString();
    run('INSERT INTO sessions (token_hash, username, role, expires_at, created_at) VALUES (?, ?, ?, ?, ?)', hash(token), user.username, user.role, expires, now.toISOString());
    audit(user.username, 'login', 'session', hash(token), { role: user.role });
    return json(res, 200, { username: user.username, role: user.role }, { 'set-cookie': `hcai_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${sessionHours * 3600}` });
  }
  if (req.method === 'GET' && url.pathname === '/api/patients') {
    requireRole(auth(req), ['attendant', 'nurse', 'doctor', 'laboratory', 'pharmacist', 'practitioner']);
    const query = (url.searchParams.get('q') ?? '').trim();
    if (query.length < 2) return json(res, 200, { patients: [] });
    const matches = rows(`SELECT p.id, p.name, p.date_of_birth, p.sex, p.created_at,
      (SELECT e.id FROM encounters e WHERE e.patient_id = p.id ORDER BY e.created_at DESC LIMIT 1) AS latest_encounter_id
      FROM patients p WHERE p.name LIKE ? COLLATE NOCASE ORDER BY p.name LIMIT 25`, `%${query}%`);
    return json(res, 200, { patients: matches });
  }
  if (req.method === 'GET' && url.pathname === '/api/attendant/today-visits') {
    requireRole(auth(req), ['attendant', 'nurse']);
    const start = url.searchParams.get('start');
    const end = url.searchParams.get('end');
    if (!start || !end || !Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end)) || Date.parse(end) <= Date.parse(start)) return json(res, 400, { error: 'Provide valid local-day start and end times' });
    const visitRows = rows(`SELECT e.id, e.patient_id, e.status, e.created_at, p.name, p.date_of_birth, p.sex
      FROM encounters e JOIN patients p ON p.id = e.patient_id
      WHERE e.created_at >= ? AND e.created_at < ? ORDER BY e.created_at DESC`, new Date(start).toISOString(), new Date(end).toISOString());
    const visits = visitRows.map((visit) => {
      const record = row('SELECT payload FROM encounter_stages WHERE encounter_id = ? AND stage = ?', visit.id, 'nurse_vitals');
      const data = record ? JSON.parse(record.payload) : null;
      return { ...visit, nurse_vitals_recorded: Boolean(record), risk_level: data ? nurseVitalsRiskLevel(visit.date_of_birth, data) : null };
    });
    return json(res, 200, { visits });
  }
  const patientRecordMatch = url.pathname.match(/^\/api\/patients\/([0-9a-f-]+)\/record$/i);
  if (req.method === 'GET' && patientRecordMatch) {
    requireRole(auth(req), ['attendant', 'nurse', 'doctor', 'laboratory', 'pharmacist', 'practitioner']);
    const record = patientRecord(patientRecordMatch[1]);
    return record ? json(res, 200, record) : json(res, 404, { error: 'Patient not found' });
  }
  if (req.method === 'POST' && url.pathname === '/api/logout') {
    const session = auth(req);
    const token = cookie(req, 'hcai_session');
    if (token) run('DELETE FROM sessions WHERE token_hash = ?', hash(token));
    if (session) audit(session.username, 'logout', 'session', null);
    return json(res, 200, { ok: true }, { 'set-cookie': 'hcai_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });
  }
  const session = auth(req);
  const reviewMatch = url.pathname.match(/^\/api\/encounters\/([0-9a-f-]+)\/reviews\/doctor_initial$/i);
  if (req.method === 'POST' && reviewMatch) {
    requireRole(session, ['doctor']);
    const encounter = row('SELECT e.id, e.patient_id, p.date_of_birth FROM encounters e JOIN patients p ON p.id = e.patient_id WHERE e.id = ?', reviewMatch[1]);
    if (!encounter) return json(res, 404, { error: 'Encounter not found' });
    if (!row('SELECT id FROM encounter_stages WHERE encounter_id = ? AND stage = ?', encounter.id, 'nurse_vitals')) return json(res, 409, { error: 'Record nurse observations before requesting a test draft' });
    const input = await body(req);
    const allowed = ['symptoms', 'suspected_conditions', 'risk_factors', 'exam_notes', 'test_request'];
    if (Object.keys(input).some((key) => !allowed.includes(key)) || Object.values(input).some((value) => typeof value !== 'string' || value.length > 5000)) return json(res, 400, { error: 'Provide supported consultation text fields (up to 5000 characters each)' });
    for (const key of allowed) if (input[key] !== undefined) input[key] = input[key].trim();
    if (!validString(input.symptoms, 5000) || !validString(input.suspected_conditions, 5000)) return json(res, 400, { error: 'Record the patient symptoms and clinician-suspected condition(s) before requesting a draft' });
    const today = new Date();
    const dob = new Date(`${encounter.date_of_birth}T00:00:00Z`);
    let ageYears = today.getUTCFullYear() - dob.getUTCFullYear();
    if (today.getUTCMonth() < dob.getUTCMonth() || (today.getUTCMonth() === dob.getUTCMonth() && today.getUTCDate() < dob.getUTCDate())) ageYears -= 1;
    const priorVisits = rows('SELECT id, created_at FROM encounters WHERE patient_id = ? AND id <> ? ORDER BY created_at DESC', encounter.patient_id, encounter.id);
    const historyContext = priorVisits.flatMap((visit) => rows('SELECT stage, payload FROM encounter_stages WHERE encounter_id = ? ORDER BY created_at', visit.id).map((stage) => {
      const saved = JSON.parse(stage.payload);
      const selected = ({ doctor_initial: ['suspected_conditions', 'symptoms', 'risk_factors'], lab_results: ['results'], doctor_results: ['assessment', 'medication_order'] })[stage.stage] ?? [];
      const facts = selected.map((key) => saved[key]).filter((value) => typeof value === 'string' && value.trim());
      return facts.length ? { visit_date: visit.created_at.slice(0, 10), source_stage: stage.stage, recorded_facts: facts } : null;
    }).filter(Boolean)).slice(0, 20);
    const output = buildTestDraft({ symptoms: input.symptoms, suspectedConditions: input.suspected_conditions, riskFactors: input.risk_factors ?? '', ageYears, historyContext });
    const id = randomUUID();
    const created = new Date().toISOString();
    const reviewInput = { ...input, retrieved_prior_visit_count: priorVisits.length, history_context: historyContext, rule_age_band: ageYears >= 18 ? 'adult' : 'under_18' };
    run('INSERT INTO agent_reviews (id, encounter_id, stage, actor, input_json, output_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', id, encounter.id, 'doctor_initial', session.username, JSON.stringify(reviewInput), JSON.stringify(output), created);
    audit(session.username, 'who_test_draft_created', 'agent_review', id, { encounter_id: encounter.id, protocol_id: output.protocol_id, status: output.status, recommendation_count: output.recommendations.length, prior_visit_count: priorVisits.length });
    return json(res, 200, { review_id: id, created_at: created, retrieved_prior_visit_count: priorVisits.length, output });
  }
  if (req.method === 'POST' && url.pathname === '/api/patients') {
    requireRole(session, ['attendant', 'nurse', 'practitioner']);
    const input = await body(req);
    const dateValue = typeof input.date_of_birth === 'string' ? Date.parse(`${input.date_of_birth}T00:00:00Z`) : Number.NaN;
    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(input.date_of_birth ?? '') && Number.isFinite(dateValue) && new Date(dateValue).toISOString().slice(0, 10) === input.date_of_birth;
    if (!validString(input.name, 160) || !validDate || !['female', 'male', 'other', 'unknown'].includes(input.sex)) return json(res, 400, { error: 'Provide name, a valid date of birth (YYYY-MM-DD), and a supported sex value' });
    const id = randomUUID();
    const created = new Date().toISOString();
    run('INSERT INTO patients (id, name, date_of_birth, sex, created_at) VALUES (?, ?, ?, ?, ?)', id, input.name.trim(), input.date_of_birth, input.sex, created);
    audit(session.username, 'patient_registered', 'patient', id, { synthetic: true });
    const encounterId = randomUUID();
    run('INSERT INTO encounters (id, patient_id, status, created_at) VALUES (?, ?, ?, ?)', encounterId, id, 'triage', created);
    audit(session.username, 'encounter_created', 'encounter', encounterId, { patient_id: id });
    return json(res, 201, { patient: { id, name: input.name.trim(), date_of_birth: input.date_of_birth, sex: input.sex } });
  }
  const newEncounter = url.pathname.match(/^\/api\/patients\/([0-9a-f-]+)\/encounters$/i);
  if (req.method === 'POST' && newEncounter) {
    requireRole(session, ['attendant', 'nurse', 'practitioner']);
    const patient = row('SELECT id FROM patients WHERE id = ?', newEncounter[1]);
    if (!patient) return json(res, 404, { error: 'Patient not found' });
    const id = randomUUID();
    const created = new Date().toISOString();
    run('INSERT INTO encounters (id, patient_id, status, created_at) VALUES (?, ?, ?, ?)', id, patient.id, 'triage', created);
    audit(session.username, 'encounter_created', 'encounter', id, { patient_id: patient.id });
    return json(res, 201, { encounter: { id, patient_id: patient.id, status: 'triage', created_at: created } });
  }
  const observationsMatch = url.pathname.match(/^\/api\/encounters\/([0-9a-f-]+)\/observations$/i);
  if (req.method === 'POST' && observationsMatch) {
    requireRole(session, ['nurse', 'practitioner']);
    const input = await body(req);
    const encounter = row('SELECT id FROM encounters WHERE id = ?', observationsMatch[1]);
    if (!encounter) return json(res, 404, { error: 'Encounter not found' });
    const supplied = Object.keys(input);
    if (supplied.some((key) => !REQUIRED_OBSERVATIONS.includes(key)) || Object.values(input).some((value) => typeof value !== 'number' || !Number.isFinite(value))) return json(res, 400, { error: 'Observations must contain only supported numeric fields' });
    const id = randomUUID();
    const created = new Date().toISOString();
    run('INSERT INTO observations (id, encounter_id, payload, recorded_by, created_at) VALUES (?, ?, ?, ?, ?)', id, encounter.id, JSON.stringify(input), session.username, created);
    audit(session.username, 'observations_recorded', 'encounter', encounter.id, { observation_id: id, fields_recorded: supplied });
    return json(res, 201, { observation_id: id, created_at: created });
  }
  const stageMatch = url.pathname.match(/^\/api\/encounters\/([0-9a-f-]+)\/stages\/([a-z_]+)$/i);
  if (req.method === 'POST' && stageMatch) {
    const [, encounterId, stageId] = stageMatch;
    const stage = workflowStages.find((candidate) => candidate.id === stageId);
    if (!stage) return json(res, 404, { error: 'Workflow stage not found' });
    requireRole(session, [stage.role]);
    const stageEncounter = row('SELECT e.id, p.date_of_birth FROM encounters e JOIN patients p ON p.id = e.patient_id WHERE e.id = ?', encounterId);
    if (!stageEncounter) return json(res, 404, { error: 'Encounter not found' });
    const input = await body(req);
    const allowedFields = {
      nurse_vitals: ['systolic_bp_mmhg', 'diastolic_bp_mmhg', 'temperature_c', 'weight_kg'],
      doctor_initial: ['symptoms', 'suspected_conditions', 'risk_factors', 'exam_notes', 'test_request', 'recommendation_review_id'],
      lab_results: ['tests_received', 'specimen', 'results', 'result_notes'],
      doctor_results: ['assessment', 'medication_order', 'ai_medication_review'],
      pharmacy: ['dispensed', 'instructions', 'substitutions', 'medicine_received']
    }[stageId];
    const invalid = Object.entries(input).some(([key, value]) => !allowedFields.includes(key) || (typeof value !== 'string' && typeof value !== 'number') || (typeof value === 'string' && value.length > 5000) || (typeof value === 'number' && !Number.isFinite(value)));
    if (invalid) return json(res, 400, { error: 'Enter supported text or numeric fields' });
    const prior = workflowStages.slice(0, workflowStages.indexOf(stage));
    if (prior.some((item) => !row('SELECT id FROM encounter_stages WHERE encounter_id = ? AND stage = ?', encounterId, item.id))) return json(res, 409, { error: 'Complete the previous workflow stage first' });
    const requiredByStage = {
      nurse_vitals: ['systolic_bp_mmhg', 'diastolic_bp_mmhg', 'temperature_c', 'weight_kg'],
      doctor_initial: ['symptoms', 'suspected_conditions', 'test_request', 'recommendation_review_id'],
      lab_results: ['tests_received', 'specimen', 'results'],
      doctor_results: ['assessment', 'medication_order'],
      pharmacy: ['dispensed', 'instructions', 'medicine_received']
    }[stageId];
    if (requiredByStage.some((key) => input[key] === undefined || String(input[key]).trim() === '')) return json(res, 400, { error: `Complete required fields: ${requiredByStage.join(', ')}` });
    if (stageId === 'pharmacy' && !['yes', 'no'].includes(input.medicine_received)) return json(res, 400, { error: 'Confirm whether the patient received the medicine' });
    if (stageId === 'nurse_vitals' && (input.systolic_bp_mmhg <= 0 || input.diastolic_bp_mmhg <= 0 || input.temperature_c <= 0 || input.weight_kg <= 0)) return json(res, 400, { error: 'Vital sign values must be positive numbers' });
    if (stageId === 'doctor_initial') {
      const review = row('SELECT output_json, input_json FROM agent_reviews WHERE id = ? AND encounter_id = ? AND stage = ? AND actor = ?', input.recommendation_review_id, encounterId, 'doctor_initial', session.username);
      if (!review) return json(res, 409, { error: 'Generate a clinician-reviewable test draft before saving the first visit' });
      const reviewedInput = JSON.parse(review.input_json);
      if (['symptoms', 'suspected_conditions', 'risk_factors', 'exam_notes'].some((field) => (input[field] ?? '') !== (reviewedInput[field] ?? ''))) return json(res, 409, { error: 'Symptoms, suspected conditions, risk context, or exam notes changed after the draft. Generate a fresh review before saving.' });
      input._recommendation_draft = JSON.parse(review.output_json);
      input._recommendation_review_input = reviewedInput;
    }
    if (stageId === 'doctor_results') delete input.ai_medication_review;
    const today = new Date();
    const dob = new Date(`${stageEncounter.date_of_birth}T00:00:00Z`);
    let ageYears = today.getUTCFullYear() - dob.getUTCFullYear();
    if (today.getUTCMonth() < dob.getUTCMonth() || (today.getUTCMonth() === dob.getUTCMonth() && today.getUTCDate() < dob.getUTCDate())) ageYears -= 1;
    const nurseRiskLevel = stageId === 'nurse_vitals' ? nurseVitalsRiskLevel(stageEncounter.date_of_birth, input) : null;
    const ageGroupLabel = ageYears <= 2 ? '0–2 years' : ageYears <= 10 ? '3–10 years' : ageYears <= 65 ? '11–65 years' : '65+ years';
    const riskMessage = nurseRiskLevel === 'High'
      ? `Recorded vitals for age group ${ageGroupLabel} (age ${ageYears}) indicate HIGH risk. Temperature: ${input.temperature_c}°C, BP: ${input.systolic_bp_mmhg}/${input.diastolic_bp_mmhg} mmHg. Values fall outside safe ranges for this age group and require prompt clinical review.`
      : nurseRiskLevel === 'Medium'
        ? `Recorded vitals for age group ${ageGroupLabel} (age ${ageYears}) indicate MEDIUM risk. Temperature: ${input.temperature_c}°C, BP: ${input.systolic_bp_mmhg}/${input.diastolic_bp_mmhg} mmHg. Some values are borderline for this age group and should be monitored.`
        : `Recorded vitals for age group ${ageGroupLabel} (age ${ageYears}) are within NORMAL range. Temperature: ${input.temperature_c}°C, BP: ${input.systolic_bp_mmhg}/${input.diastolic_bp_mmhg} mmHg.`;
    const stageOutputs = {
      nurse_vitals: nurseRiskLevel === 'High'
        ? { status: 'urgent_clinician_review_prompt', risk_level: nurseRiskLevel, message: riskMessage, source: { title: 'WHO Interagency Integrated Triage Tool', url: 'https://cdn.who.int/media/docs/default-source/integrated-health-services-%28ihs%29/csy/general-scf-ref-card.pdf' } }
        : { status: nurseRiskLevel === 'Medium' ? 'elevated_monitoring_recommended' : 'not_clinically_assessed', risk_level: nurseRiskLevel, message: riskMessage },
      doctor_initial: { status: 'clinician_review_required', message: 'WHO-based test suggestions are drafts only. The doctor has reviewed and edited the final test request before handoff.' },
      lab_results: { status: 'results_recorded', message: 'Results saved to the encounter for doctor review.' },
      doctor_results: { status: 'clinician_review_required', message: 'The clinician assessment and medication order are saved. WHO AWaRe infection guidance is not sufficient to select a patient-specific medicine/dose here: allergy, pregnancy, renal/liver status, diagnosis, and the hospital formulary are not available. No medicine or dose suggestion was generated.', source: { title: 'WHO AWaRe antibiotic book', url: 'https://www.who.int/publications/i/item/9789240062382' } },
      pharmacy: { status: 'dispensing_recorded', message: 'Dispensing and counseling recorded. The hospital medicine catalog/stock list is not configured, so the system cannot recommend an in-stock substitute or quantity. Substitution remains a pharmacist decision.' }
    };
    if (stageId === 'doctor_initial') {
      const draft = input._recommendation_draft;
      stageOutputs.doctor_initial = draft.recommendations.length
        ? { status: 'clinician_review_required', message: 'WHO guideline test suggestions were stored alongside the doctor-edited laboratory request. They are drafts, not a diagnosis.' }
        : { status: 'no_rule_matched', message: 'No configured WHO test draft rule matched the clinician-entered condition(s). The doctor’s test request is saved for laboratory handoff.' };
    }
    if (stageId === 'nurse_vitals') {
      audit(session.username, 'nurse_vitals_ai_review_started', 'encounter', encounterId, { risk_level: nurseRiskLevel });
      try {
        const explanation = await explainNurseVitalsReview(input, nurseRiskLevel, stageOutputs.nurse_vitals.message);
        stageOutputs.nurse_vitals.ai_explanation = explanation.explanation;
        stageOutputs.nurse_vitals.ai_model = explanation.model;
        audit(session.username, 'nurse_vitals_ai_review_completed', 'encounter', encounterId, { risk_level: nurseRiskLevel, model: explanation.model });
      } catch (error) {
        audit(session.username, 'nurse_vitals_ai_review_failed', 'encounter', encounterId, { risk_level: nurseRiskLevel, error: error.message });
        throw Object.assign(new Error(`Vitals were not saved because the AI review failed: ${error.message}`), { status: 503 });
      }
    }
    input._assistant_review = stageOutputs[stageId];
    const created = new Date().toISOString();
    const laterStages = workflowStages.slice(workflowStages.indexOf(stage) + 1);
    for (const later of laterStages) {
      const removed = run('DELETE FROM encounter_stages WHERE encounter_id = ? AND stage = ?', encounterId, later.id);
      if (removed.changes) audit(session.username, 'downstream_stage_invalidated', 'encounter', encounterId, { changed_stage: stageId, invalidated_stage: later.id });
    }
    run('INSERT INTO encounter_stages (id, encounter_id, stage, payload, recorded_by, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(encounter_id, stage) DO UPDATE SET payload=excluded.payload, recorded_by=excluded.recorded_by, created_at=excluded.created_at', randomUUID(), encounterId, stageId, JSON.stringify(input), session.username, created);
    audit(session.username, 'workflow_stage_recorded', 'encounter', encounterId, { stage: stageId, fields: Object.keys(input) });
    const nextEncounterStatus = stageId === 'pharmacy'
      ? (input.medicine_received === 'yes' ? 'complete' : 'pharmacy')
      : workflowStages[workflowStages.indexOf(stage) + 1]?.id ?? 'complete';
    run('UPDATE encounters SET status = ? WHERE id = ?', nextEncounterStatus, encounterId);
    return json(res, 201, { stage: stageId, recorded_at: created, recorded_by: session.username, assistant_review: stageOutputs[stageId] });
  }
  const workflowMatch = url.pathname.match(/^\/api\/encounters\/([0-9a-f-]+)\/run$/i);
  if (req.method === 'POST' && workflowMatch) {
    requireRole(session, ['nurse', 'practitioner']);
    try { return json(res, 200, await runWorkflow(workflowMatch[1], session.username)); }
    catch (error) { return json(res, error.status ?? 503, { error: error.message }); }
  }
  const decisionMatch = url.pathname.match(/^\/api\/approvals\/([0-9a-f-]+)$/i);
  if (req.method === 'POST' && decisionMatch) {
    requireRole(session, ['practitioner']);
    const input = await body(req);
    if (!['approve', 'reject'].includes(input.decision) || (input.decision === 'reject' && !validString(input.reason, 500))) return json(res, 400, { error: 'Provide approve, or reject with a reason' });
    const approval = row('SELECT ap.id, ap.alert_id, ap.status, a.encounter_id FROM approvals ap JOIN alerts a ON a.id = ap.alert_id WHERE ap.id = ?', decisionMatch[1]);
    if (!approval) return json(res, 404, { error: 'Approval request not found' });
    if (approval.status !== 'pending') return json(res, 409, { error: 'This approval request has already been decided' });
    const now = new Date().toISOString();
    const next = input.decision === 'approve' ? 'approved' : 'rejected';
    db.exec('BEGIN IMMEDIATE');
    try {
      const updated = run('UPDATE approvals SET status = ?, decided_by = ?, decision_reason = ?, decided_at = ? WHERE id = ? AND status = ?', next, session.username, input.reason ?? null, now, approval.id, 'pending');
      if (updated.changes !== 1) { db.exec('ROLLBACK'); return json(res, 409, { error: 'This approval request has already been decided' }); }
      const alertUpdated = run('UPDATE alerts SET status = ? WHERE id = ? AND status = ?', next, approval.alert_id, 'pending_approval');
      if (alertUpdated.changes !== 1) throw new Error('Alert state changed before the approval could be applied');
      run('UPDATE workflow_actions SET status = ?, updated_at = ? WHERE alert_id = ?', next, now, approval.alert_id);
      run('UPDATE agent_runs SET status = ? WHERE id = (SELECT run_id FROM alert_submissions WHERE alert_id = ?)', next, approval.alert_id);
      audit(session.username, input.decision === 'approve' ? 'alert_approved_and_published' : 'alert_rejected', 'alert', approval.alert_id, { approval_id: approval.id, reason: input.reason ?? null });
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    return json(res, 200, { approval_id: approval.id, alert_id: approval.alert_id, status: next });
  }
  const encounterMatch = url.pathname.match(/^\/api\/encounters\/([0-9a-f-]+)$/i);
  if (req.method === 'GET' && encounterMatch) {
    requireRole(session, ['attendant', 'nurse', 'doctor', 'laboratory', 'pharmacist', 'practitioner']);
    const result = encounterSnapshot(encounterMatch[1]);
    return result ? json(res, 200, result) : json(res, 404, { error: 'Encounter not found' });
  }
  return json(res, 404, { error: 'Route not found' });
}

async function staticFile(req, res, pathname) {
  const requestedPath = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1));
  const fullPath = resolve(frontendRoot, requestedPath);
  const pathFromRoot = relative(frontendRoot, fullPath);
  if (isAbsolute(pathFromRoot) || pathFromRoot === '..' || pathFromRoot.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)) return json(res, 403, { error: 'Forbidden' });
  try {
    const content = await readFile(fullPath);
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
    res.writeHead(200, { 'content-type': types[extname(fullPath)] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(content);
  } catch {
    if (req.headers.accept?.includes('text/html')) {
      const index = await readFile(resolve(frontendRoot, 'index.html'));
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' });
      res.end(index);
      return;
    }
    json(res, 404, { error: 'Not found' });
  }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${host}:${port}`);
    if (url.pathname === '/health' && req.method === 'GET') return json(res, 200, { status: 'ok', service: 'healthcareai2-api', database: 'connected' });
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (req.method === 'GET') return await staticFile(req, res, url.pathname);
    return json(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    return json(res, error.status ?? 500, { error: error.status ? error.message : 'Unexpected server error' });
  }
});
server.listen(port, host, () => console.log(`HealthcareAI2 API and UI on http://${host}:${port}`));
process.on('SIGINT', () => { server.close(); db.close(); process.exit(0); });
process.on('SIGTERM', () => { server.close(); db.close(); process.exit(0); });
