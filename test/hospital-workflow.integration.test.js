import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';

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
    if (child.exitCode !== null) throw new Error(`API exited early: ${child.exitCode}`);
    try { const response = await fetch(url); if (response.ok) return; } catch {}
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error('API did not become ready');
}

test('department roles can search a patient and complete the ordered synthetic visit', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'healthcareai2-hospital-flow-'));
  const port = await unusedPort();
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: root, stdio: 'ignore', windowsHide: true,
    env: { ...process.env, DATABASE_PATH: join(directory, 'workflow.sqlite'), HOST: '127.0.0.1', PORT: String(port) }
  });
  t.after(async () => {
    child.kill('SIGTERM');
    await new Promise((resolveExit) => { if (child.exitCode !== null) resolveExit(); else child.once('exit', resolveExit); });
    await rm(directory, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${port}`;
  await waitReady(`${base}/health`, child);
  async function login(username) {
    const response = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password: `${username}-demo` }) });
    assert.equal(response.status, 200);
    return response.headers.getSetCookie()[0].split(';')[0];
  }
  async function call(cookie, path, method = 'GET', body) {
    const response = await fetch(`${base}${path}`, { method, headers: { cookie, ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: await response.json() };
  }

  const attendant = await login('attendant');
  const registered = await call(attendant, '/api/patients', 'POST', { name: 'Synthetic Flow Patient', date_of_birth: '1990-01-01', sex: 'unknown' });
  assert.equal(registered.status, 201);
  assert.equal(registered.data.encounter, undefined, 'attendant response should not expose an encounter identifier');
  const search = await call(attendant, '/api/patients?q=Synthetic%20Flow');
  assert.equal(search.data.patients.length, 1);
  const { id: patientId, latest_encounter_id: encounterId } = search.data.patients[0];
  assert.ok(encounterId);

  const nurse = await login('nurse');
  const vitals = await call(nurse, `/api/encounters/${encounterId}/stages/nurse_vitals`, 'POST', { systolic_bp_mmhg: 180, diastolic_bp_mmhg: 120, temperature_c: 36.8, weight_kg: 65 });
  assert.equal(vitals.status, 201);
  assert.equal(vitals.data.assistant_review.status, 'urgent_clinician_review_prompt');
  const forbidden = await call(nurse, `/api/encounters/${encounterId}/stages/doctor_initial`, 'POST', { symptoms: 'synthetic', test_request: 'synthetic test' });
  assert.equal(forbidden.status, 403);

  const doctor = await login('doctor');
  const review = await call(doctor, `/api/encounters/${encounterId}/reviews/doctor_initial`, 'POST', { symptoms: 'fever, dysuria and urinary frequency', suspected_conditions: 'malaria and lower UTI', risk_factors: 'recurrent UTI', exam_notes: 'synthetic exam', test_request: 'clinician test idea' });
  assert.equal(review.status, 200);
  assert.equal(review.data.output.recommendations.length, 3);
  assert.ok(review.data.output.recommendations.some((item) => item.test.toLowerCase().includes('malaria')));
  assert.ok(review.data.output.recommendations.some((item) => item.test.toLowerCase().includes('urinalysis')));
  assert.ok(review.data.output.recommendations.some((item) => item.test.toLowerCase().includes('culture')));
  const changedFacts = await call(doctor, `/api/encounters/${encounterId}/stages/doctor_initial`, 'POST', { symptoms: 'different symptoms', suspected_conditions: 'malaria and lower UTI', risk_factors: 'recurrent UTI', exam_notes: 'synthetic exam', test_request: 'clinician test idea', recommendation_review_id: review.data.review_id });
  assert.equal(changedFacts.status, 409, 'a test draft cannot be saved against changed patient facts');
  assert.equal((await call(doctor, `/api/encounters/${encounterId}/stages/doctor_initial`, 'POST', { symptoms: 'fever, dysuria and urinary frequency', suspected_conditions: 'malaria and lower UTI', risk_factors: 'recurrent UTI', exam_notes: 'synthetic exam', test_request: 'clinician test idea\nMalaria RDT', recommendation_review_id: review.data.review_id })).status, 201);
  const laboratory = await login('laboratory');
  assert.equal((await call(laboratory, `/api/encounters/${encounterId}/stages/lab_results`, 'POST', { tests_received: '["test one","test two"]', specimen: '["sample one","sample two"]', results: '[{"result":"synthetic"}]' })).status, 201);
  assert.equal((await call(doctor, `/api/encounters/${encounterId}/stages/doctor_results`, 'POST', { assessment: 'synthetic assessment', medication_order: 'Synthetic medication 1\nSynthetic medication 2' })).status, 201);
  const pharmacist = await login('pharmacist');
  assert.equal((await call(pharmacist, `/api/encounters/${encounterId}/stages/pharmacy`, 'POST', { dispensed: '[]', instructions: 'Synthetic directions', substitutions: '[]' })).status, 201);

  const record = await call(doctor, `/api/patients/${patientId}/record`);
  assert.equal(record.status, 200);
  assert.deepEqual(record.data.encounters[0].stages.map((stage) => stage.stage), ['nurse_vitals', 'doctor_initial', 'lab_results', 'doctor_results', 'pharmacy']);
  assert.equal(record.data.encounters[0].stages.at(-1).recorded_by, 'pharmacist');
  const revisedDraft = await call(doctor, `/api/encounters/${encounterId}/reviews/doctor_initial`, 'POST', { symptoms: 'revised synthetic symptoms', suspected_conditions: 'suspected malaria', exam_notes: 'synthetic exam', test_request: 'revised synthetic test' });
  const revisedConsultation = await call(doctor, `/api/encounters/${encounterId}/stages/doctor_initial`, 'POST', { symptoms: 'revised synthetic symptoms', suspected_conditions: 'suspected malaria', exam_notes: 'synthetic exam', test_request: 'revised synthetic test', recommendation_review_id: revisedDraft.data.review_id });
  assert.equal(revisedConsultation.status, 201);
  const revisedRecord = await call(doctor, `/api/patients/${patientId}/record`);
  assert.deepEqual(revisedRecord.data.encounters[0].stages.map((stage) => stage.stage), ['nurse_vitals', 'doctor_initial'], 'changing an earlier handoff must clear stale downstream stages');
});
