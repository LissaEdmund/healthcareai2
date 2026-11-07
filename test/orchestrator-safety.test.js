import test from 'node:test';
import assert from 'node:assert/strict';
import { validateModelOutput } from '../src/orchestrator.js';
import { evaluateObservations } from '../src/protocol.js';

const context = { history: [], history_note: 'No prior encounter history is stored.' };
const observations = { temperature_c: 36.8, heart_rate_bpm: 72, respiratory_rate_per_min: 16, systolic_bp_mmhg: 118, diastolic_bp_mmhg: 76, oxygen_saturation_percent: 98 };
const evaluation = evaluateObservations(observations);

test('model output schema rejects any attempt to add or override a risk classification', () => {
  const output = JSON.stringify({
    history_context: 'none_recorded', requested_action: 'practitioner_review',
    clinical_risk_classification: 'high'
  });
  assert.throws(() => validateModelOutput(output, context, evaluation, observations), /allowed explanation schema/);
});

test('model output schema rejects diagnosis and prescription fields', () => {
  const output = JSON.stringify({
    history_context: 'none_recorded', requested_action: 'practitioner_review',
    diagnosis: 'unsupported', prescription: 'unsupported'
  });
  assert.throws(() => validateModelOutput(output, context, evaluation, observations), /allowed explanation schema/);
});

test('model cannot claim historical context absent from the retrieved record', () => {
  const output = JSON.stringify({
    history_context: 'present', requested_action: 'practitioner_review'
  });
  assert.throws(() => validateModelOutput(output, context, evaluation, observations), /history label conflicted/);
});

test('model cannot request a clinical action outside practitioner review', () => {
  const output = JSON.stringify({
    history_context: 'none_recorded', requested_action: 'prescribe'
  });
  assert.throws(() => validateModelOutput(output, context, evaluation, observations), /allowed explanation schema/);
});

test('valid model extraction remains limited to the validated record', () => {
  const output = JSON.stringify({
    history_context: 'none_recorded', requested_action: 'practitioner_review'
  });
  assert.equal(validateModelOutput(output, context, evaluation, observations).requested_action, 'practitioner_review');
});
