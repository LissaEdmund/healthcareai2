import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { extname, isAbsolute, relative, resolve } from 'node:path';
import { db, row, rows, run, audit } from './db.js';
import { REQUIRED_OBSERVATIONS } from './protocol.js';
import { runWorkflow } from './orchestrator.js';

const host = process.env.HOST ?? '127.0.0.1';
const port = Number(process.env.PORT ?? 3000);
const sessionHours = 8;
const demoUsers = [
  { username: 'nurse', password: process.env.DEMO_NURSE_PASSWORD ?? 'nurse-demo', role: 'nurse' },
  { username: 'practitioner', password: process.env.DEMO_PRACTITIONER_PASSWORD ?? 'practitioner-demo', role: 'practitioner' }
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
  if (req.method === 'POST' && url.pathname === '/api/logout') {
    const session = auth(req);
    const token = cookie(req, 'hcai_session');
    if (token) run('DELETE FROM sessions WHERE token_hash = ?', hash(token));
    if (session) audit(session.username, 'logout', 'session', null);
    return json(res, 200, { ok: true }, { 'set-cookie': 'hcai_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });
  }
  const session = auth(req);
  if (req.method === 'POST' && url.pathname === '/api/patients') {
    requireRole(session, ['nurse', 'practitioner']);
    const input = await body(req);
    const dateValue = typeof input.date_of_birth === 'string' ? Date.parse(`${input.date_of_birth}T00:00:00Z`) : Number.NaN;
    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(input.date_of_birth ?? '') && Number.isFinite(dateValue) && new Date(dateValue).toISOString().slice(0, 10) === input.date_of_birth;
    if (!validString(input.name, 160) || !validDate || !['female', 'male', 'other', 'unknown'].includes(input.sex)) return json(res, 400, { error: 'Provide name, a valid date of birth (YYYY-MM-DD), and a supported sex value' });
    const id = randomUUID();
    const created = new Date().toISOString();
    run('INSERT INTO patients (id, name, date_of_birth, sex, created_at) VALUES (?, ?, ?, ?, ?)', id, input.name.trim(), input.date_of_birth, input.sex, created);
    audit(session.username, 'patient_registered', 'patient', id, { synthetic: true });
    return json(res, 201, { patient: { id, name: input.name.trim(), date_of_birth: input.date_of_birth, sex: input.sex } });
  }
  const newEncounter = url.pathname.match(/^\/api\/patients\/([0-9a-f-]+)\/encounters$/i);
  if (req.method === 'POST' && newEncounter) {
    requireRole(session, ['nurse', 'practitioner']);
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
    requireRole(session, ['nurse', 'practitioner']);
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
  } catch { json(res, 404, { error: 'Not found' }); }
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
