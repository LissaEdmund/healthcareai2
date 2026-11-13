export const WHO_SOURCES = {
  malaria: {
    title: 'WHO malaria diagnosis guidance',
    url: 'https://www.who.int/teams/global-malaria-programme/case-management/diagnosis/microscopy',
    version: 'WHO Guidelines for malaria, current online version (updated 10 September 2026)'
  },
  aware: {
    title: 'WHO AWaRe antibiotic book',
    url: 'https://www.who.int/publications/i/item/9789240062382',
    version: '2022 edition; WHO notes this book is being updated'
  }
};

export function buildTestDraft({ suspectedConditions = '', symptoms = '', riskFactors = '', ageYears = null, historyContext = [] }) {
  const suspected = suspectedConditions.toLocaleLowerCase();
  const symptomText = symptoms.toLocaleLowerCase();
  const risks = riskFactors.toLocaleLowerCase();
  const recommendations = [];
  const reviewNotes = [];

  if (/\bmalaria\b/.test(suspected)) {
    recommendations.push({
      test: 'Malaria parasite-based test (quality-assured microscopy or malaria RDT)',
      reason: 'The doctor recorded suspected malaria. WHO recommends parasite-based diagnosis by microscopy or rapid diagnostic test before antimalarial treatment.',
      supporting_facts: ['Clinician-entered suspected condition: malaria'],
      source: WHO_SOURCES.malaria
    });
  }

  if (/\buti\b|urinary tract infection/.test(suspected)) {
    if (ageYears === null || ageYears < 18) {
      reviewNotes.push('The WHO AWaRe draft rule currently covers adults only; no UTI test suggestion was generated for this age/unknown-age record.');
    } else {
      const urinarySymptoms = [
        ['dysuria|painful urination|burning (when|during) urination', 'dysuria'],
        ['urinary urgency|urgency to urinate', 'urinary urgency'],
        ['urinary frequency|frequent urination|frequency', 'urinary frequency'],
        ['lower abdominal pain|suprapubic pain|lower abdominal discomfort', 'lower abdominal pain/discomfort'],
        ['visible blood in urine|gross hematuria|blood in urine', 'blood in urine']
      ].filter(([pattern]) => new RegExp(pattern).test(symptomText)).map(([, fact]) => fact);
      if (urinarySymptoms.length) {
        recommendations.push({
          test: 'Urinalysis (dipstick or microscopy)',
          reason: 'For a clinician-suspected lower UTI with urinary symptoms, the WHO AWaRe book describes urinalysis to detect bacteriuria or indirect signs such as leukocyte esterase and nitrites.',
          supporting_facts: [`Clinician-entered suspected condition: lower UTI`, ...urinarySymptoms.map((fact) => `Recorded symptom: ${fact}`)],
          source: WHO_SOURCES.aware
        });
        if (/recurrent|repeat uti|previous uti|pregnan|structural anomal|urinary tract anomal|immunocomprom/.test(risks)) {
          recommendations.push({
            test: 'Urine culture and susceptibility',
            reason: 'The WHO AWaRe book says to consider urine culture when UTI is recurrent or there are risk factors for complicated UTI, to confirm diagnosis and guide antibiotic susceptibility.',
            supporting_facts: [`Recorded risk context: ${riskFactors.trim()}`],
            source: WHO_SOURCES.aware
          });
        } else {
          reviewNotes.push('Confirm pregnancy, recurrence, structural urinary conditions, immunosuppression, and other complicated-UTI risk factors. A culture suggestion is only generated when such context is recorded.');
        }
      } else {
        reviewNotes.push('UTI was entered as a suspicion, but the current WHO draft rule requires recorded urinary symptoms before suggesting urinalysis. No UTI test suggestion was generated.');
      }
    }
  }

  if (!recommendations.length && !reviewNotes.length) reviewNotes.push('No WHO draft test rule is configured for the clinician-entered suspected condition(s). Review the history and local guidance manually.');
  return {
    protocol_id: 'who-guideline-test-draft',
    protocol_version: '0.1.0',
    status: recommendations.length ? 'clinician_review_required' : 'no_rule_matched',
    recommendations,
    history_context: historyContext,
    review_notes: reviewNotes,
    limitations: ['Draft decision support only; it does not establish a diagnosis or replace local/national guidance.', 'The doctor must edit and confirm the final laboratory request.']
  };
}
