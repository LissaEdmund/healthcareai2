// Demonstration-only data validation. This file contains no clinical thresholds
// and does not classify a patient's clinical risk.
export const PROTOCOL_ID = 'synthetic-observation-completeness';
export const PROTOCOL_VERSION = '0.1.0';

export const REQUIRED_OBSERVATIONS = [
  'temperature_c',
  'heart_rate_bpm',
  'respiratory_rate_per_min',
  'systolic_bp_mmhg',
  'diastolic_bp_mmhg',
  'oxygen_saturation_percent'
];

export function evaluateObservations(observations) {
  const missing = REQUIRED_OBSERVATIONS.filter((key) => observations[key] === undefined || observations[key] === null || observations[key] === '');
  const invalid = [];
  for (const key of REQUIRED_OBSERVATIONS) {
    const value = observations[key];
    if (value !== undefined && value !== null && value !== '' && (typeof value !== 'number' || !Number.isFinite(value))) invalid.push(key);
  }
  return {
    protocol_id: PROTOCOL_ID,
    protocol_version: PROTOCOL_VERSION,
    status: missing.length || invalid.length ? 'incomplete' : 'not_clinically_assessed',
    clinical_risk_classification: null,
    missing_observations: missing,
    invalid_observations: invalid,
    triggered_rules: missing.length || invalid.length ? ['OBSERVATION_COMPLETENESS_REVIEW'] : [],
    explanation: 'This synthetic demonstration protocol checks required-field completeness only. It defines no clinical thresholds and makes no clinical risk classification.'
  };
}
