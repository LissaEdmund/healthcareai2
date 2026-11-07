import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
async function unusedPort() {
  const server = createServer();
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  const port = server.address().port;
  await new Promise((resolveClose) => server.close(resolveClose));
  return port;
}
async function login(base, username, password) {
  const response = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) });
  assert.equal(response.status, 200);
  return response.headers.getSetCookie()[0].split(';')[0];
}

test('practitioner approval is enforced, persisted, and cannot be repeated', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'healthcareai2-approval-'));
  const dbPath = join(directory, 'test.sqlite');
  const port = await unusedPort();
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: root, stdio: 'ignore', windowsHide: true,
    env: { ...process.env, DATABASE_PATH: dbPath, PORT: String(port), HOST: '127.0.0.1', DEMO_NURSE_PASSWORD: 'nurse-demo', DEMO_PRACTITIONER_PASSWORD: 'practitioner-demo' }
  });
  t.after(async () => {
    child.kill('SIGTERM');
    await new Promise((resolveExit) => { if (child.exitCode !== null) resolveExit(); else child.once('exit', resolveExit); });
    await rm(directory, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let i = 0; i < 80; i += 1) {
    if (child.exitCode !== null) throw new Error(`API exited early: ${child.exitCode}`);
    try { if ((await fetch(`${base}/health`)).ok) { ready = true; break; } } catch {}
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  assert.equal(ready, true, 'API did not become ready');

  const db = new DatabaseSync(dbPath);
  const patientId = randomUUID();
  const encounterId = randomUUID();
  const alerts = [randomUUID(), randomUUID()];
  const approvals = [randomUUID(), randomUUID()];
  const now = new Date().toISOString();
  db.prepare('INSERT INTO patients (id, name, date_of_birth, sex, created_at) VALUES (?, ?, ?, ?, ?)').run(patientId, 'Synthetic Approval Test', '1990-01-01', 'unknown', now);
  db.prepare('INSERT INTO encounters (id, patient_id, status, created_at) VALUES (?, ?, ?, ?)').run(encounterId, patientId, 'triage', now);
  for (let index = 0; index < alerts.length; index += 1) {
    db.prepare('INSERT INTO alerts (id, encounter_id, status, title, body, evidence, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(alerts[index], encounterId, 'pending_approval', `Synthetic draft ${index + 1}`, 'Review this synthetic draft.', '[]', now);
    db.prepare('INSERT INTO approvals (id, alert_id, status, requested_by, created_at) VALUES (?, ?, ?, ?, ?)').run(approvals[index], alerts[index], 'pending', 'test-agent', now);
  }
  db.close();

  const nurseCookie = await login(base, 'nurse', 'nurse-demo');
  const practitionerCookie = await login(base, 'practitioner', 'practitioner-demo');
  const denied = await fetch(`${base}/api/approvals/${approvals[0]}`, { method: 'POST', headers: { cookie: nurseCookie, 'content-type': 'application/json' }, body: JSON.stringify({ decision: 'approve' }) });
  assert.equal(denied.status, 403);

  const approveUrl = `${base}/api/approvals/${approvals[0]}`;
  const approved = await fetch(approveUrl, { method: 'POST', headers: { cookie: practitionerCookie, 'content-type': 'application/json' }, body: JSON.stringify({ decision: 'approve' }) });
  assert.equal(approved.status, 200);
  assert.equal((await approved.json()).status, 'approved');
  const duplicate = await fetch(approveUrl, { method: 'POST', headers: { cookie: practitionerCookie, 'content-type': 'application/json' }, body: JSON.stringify({ decision: 'approve' }) });
  assert.equal(duplicate.status, 409);

  const rejected = await fetch(`${base}/api/approvals/${approvals[1]}`, { method: 'POST', headers: { cookie: practitionerCookie, 'content-type': 'application/json' }, body: JSON.stringify({ decision: 'reject', reason: 'Synthetic test rejection' }) });
  assert.equal(rejected.status, 200);
  assert.equal((await rejected.json()).status, 'rejected');
  const verify = new DatabaseSync(dbPath);
  assert.equal(verify.prepare('SELECT status FROM alerts WHERE id = ?').get(alerts[0]).status, 'approved');
  assert.equal(verify.prepare('SELECT status, decided_by FROM approvals WHERE id = ?').get(approvals[0]).status, 'approved');
  assert.equal(verify.prepare('SELECT status, decision_reason FROM approvals WHERE id = ?').get(approvals[1]).decision_reason, 'Synthetic test rejection');
  assert.equal(verify.prepare('SELECT COUNT(*) AS n FROM audit_log WHERE action = ?').get('alert_approved_and_published').n, 1);
  verify.close();
});
