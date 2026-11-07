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
import { evaluateObservations } from '../src/protocol.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
async function unusedPort() {
  const server = createServer();
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  const port = server.address().port;
  await new Promise((resolveClose) => server.close(resolveClose));
  return port;
}
async function waitReady(url, child) {
  for (let i = 0; i < 80; i += 1) {
    if (child.exitCode !== null) throw new Error(`MCP service exited early: ${child.exitCode}`);
    try { const response = await fetch(url); if (response.ok) return; } catch {}
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error('MCP service did not become ready');
}
async function rpcResponse(response) {
  const text = await response.text();
  const json = response.headers.get('content-type')?.includes('text/event-stream') || text.trimStart().startsWith('event:')
    ? text.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).join('\n')
    : text;
  return JSON.parse(json);
}
async function callTool(endpoint, token, name, args) {
  const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${token}` };
  const initialized = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'integration-test', version: '0.1' } } }) });
  assert.equal(initialized.status, 200);
  await rpcResponse(initialized);
  await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) });
  const response = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: args } }) });
  assert.equal(response.status, 200);
  const result = await rpcResponse(response);
  assert.equal(result.error, undefined, JSON.stringify(result.error));
  return JSON.parse(result.result.content[0].text);
}

test('custom MCP context, deterministic evaluation, alert action, and duplicate guard', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'healthcareai2-mcp-'));
  const dbPath = join(directory, 'test.sqlite');
  const port = await unusedPort();
  const token = 'mcp-integration-secret';
  const child = spawn(process.execPath, ['src/mcp-server.js'], {
    cwd: root, stdio: 'ignore', windowsHide: true,
    env: { ...process.env, DATABASE_PATH: dbPath, MCP_PORT: String(port), MCP_INTERNAL_TOKEN: token }
  });
  t.after(async () => {
    child.kill('SIGTERM');
    await new Promise((resolveExit) => { if (child.exitCode !== null) resolveExit(); else child.once('exit', resolveExit); });
    await rm(directory, { recursive: true, force: true });
  });
  const endpoint = `http://127.0.0.1:${port}/mcp`;
  await waitReady(`http://127.0.0.1:${port}/health`, child);

  const patientId = randomUUID();
  const encounterId = randomUUID();
  const runId = randomUUID();
  const now = new Date().toISOString();
  const observations = { temperature_c: 36.8, heart_rate_bpm: 72, respiratory_rate_per_min: 16, systolic_bp_mmhg: 118, diastolic_bp_mmhg: 76, oxygen_saturation_percent: 98 };
  const evaluation = evaluateObservations(observations);
  const db = new DatabaseSync(dbPath);
  db.prepare('INSERT INTO patients (id, name, date_of_birth, sex, created_at) VALUES (?, ?, ?, ?, ?)').run(patientId, 'Synthetic MCP Test', '1990-01-01', 'unknown', now);
  db.prepare('INSERT INTO encounters (id, patient_id, status, created_at) VALUES (?, ?, ?, ?)').run(encounterId, patientId, 'triage', now);
  db.prepare('INSERT INTO observations (id, encounter_id, payload, recorded_by, created_at) VALUES (?, ?, ?, ?, ?)').run(randomUUID(), encounterId, JSON.stringify(observations), 'nurse', now);
  db.prepare('INSERT INTO agent_runs (id, encounter_id, status, evaluation, created_at) VALUES (?, ?, ?, ?, ?)').run(runId, encounterId, 'running', JSON.stringify(evaluation), now);
  db.close();

  const context = await callTool(endpoint, token, 'get_patient_context', { patient_id: patientId, encounter_id: encounterId });
  assert.equal(context.patient.id, patientId);
  assert.equal(context.observations.length, 1);
  const evaluated = await callTool(endpoint, token, 'evaluate_clinical_risk', { encounter_id: encounterId, observations });
  assert.equal(evaluated.clinical_risk_classification, null);
  assert.equal(evaluated.protocol_version, '0.1.0');
  const draft = await callTool(endpoint, token, 'submit_clinical_alert', { encounter_id: encounterId, run_id: runId, title: 'Practitioner review requested', body: 'Please review the recorded synthetic information.', evidence: [`protocol:${evaluation.protocol_id}@${evaluation.protocol_version}`] });
  const repeated = await callTool(endpoint, token, 'submit_clinical_alert', { encounter_id: encounterId, run_id: runId, title: 'Duplicate', body: 'This must not create a second alert.', evidence: [] });
  assert.equal(draft.status, 'pending_approval');
  assert.equal(repeated.duplicate, true);
  assert.equal(repeated.alert_id, draft.alert_id);

  const unauthorized = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'unauthorized-test', version: '0.1' } } }) });
  assert.equal(unauthorized.status, 401);
  const check = new DatabaseSync(dbPath);
  assert.equal(check.prepare('SELECT COUNT(*) AS n FROM alerts').get().n, 1);
  assert.equal(check.prepare('SELECT COUNT(*) AS n FROM approvals WHERE status = ?').get('pending').n, 1);
  assert.equal(check.prepare('SELECT COUNT(*) AS n FROM audit_log WHERE action = ?').get('alert_approval_requested').n, 1);
  check.close();
});
