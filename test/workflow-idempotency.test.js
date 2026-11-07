import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { db } from '../src/db.js';
import { runWorkflow } from '../src/orchestrator.js';

test('a pending or published action blocks duplicate work on the same observation', async () => {
  const patientId = randomUUID();
  const encounterId = randomUUID();
  const observationId = randomUUID();
  const runId = randomUUID();
  const now = new Date().toISOString();
  db.prepare('INSERT INTO patients (id, name, date_of_birth, sex, created_at) VALUES (?, ?, ?, ?, ?)').run(patientId, 'Synthetic Idempotency Test', '1990-01-01', 'unknown', now);
  db.prepare('INSERT INTO encounters (id, patient_id, status, created_at) VALUES (?, ?, ?, ?)').run(encounterId, patientId, 'triage', now);
  db.prepare('INSERT INTO observations (id, encounter_id, payload, recorded_by, created_at) VALUES (?, ?, ?, ?, ?)').run(observationId, encounterId, '{}', 'nurse', now);
  db.prepare('INSERT INTO workflow_actions (observation_id, encounter_id, run_id, status, updated_at) VALUES (?, ?, ?, ?, ?)').run(observationId, encounterId, runId, 'awaiting_approval', now);
  try {
    await assert.rejects(runWorkflow(encounterId, 'nurse'), { status: 409, message: /active or published/ });
  } finally {
    db.prepare('DELETE FROM workflow_actions WHERE observation_id = ?').run(observationId);
    db.prepare('DELETE FROM observations WHERE id = ?').run(observationId);
    db.prepare('DELETE FROM encounters WHERE id = ?').run(encounterId);
    db.prepare('DELETE FROM patients WHERE id = ?').run(patientId);
  }
});
