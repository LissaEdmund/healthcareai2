import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateObservations, PROTOCOL_ID, PROTOCOL_VERSION } from '../src/protocol.js';

const complete = {
  temperature_c: 36.8, heart_rate_bpm: 72, respiratory_rate_per_min: 16,
  systolic_bp_mmhg: 118, diastolic_bp_mmhg: 76, oxygen_saturation_percent: 98
};

test('complete synthetic observations produce no clinical classification', () => {
  const result = evaluateObservations(complete);
  assert.equal(result.protocol_id, PROTOCOL_ID);
  assert.equal(result.protocol_version, PROTOCOL_VERSION);
  assert.equal(result.status, 'not_clinically_assessed');
  assert.equal(result.clinical_risk_classification, null);
  assert.deepEqual(result.triggered_rules, []);
});

test('missing and invalid observations are reported without assigning risk', () => {
  const result = evaluateObservations({ temperature_c: 'invalid' });
  assert.equal(result.status, 'incomplete');
  assert.ok(result.missing_observations.includes('heart_rate_bpm'));
  assert.deepEqual(result.invalid_observations, ['temperature_c']);
  assert.equal(result.clinical_risk_classification, null);
  assert.deepEqual(result.triggered_rules, ['OBSERVATION_COMPLETENESS_REVIEW']);
});
