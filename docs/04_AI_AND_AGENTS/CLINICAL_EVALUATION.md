# Clinical recommendation boundaries

## Current implementation

The six-stage demo uses deterministic, narrow draft rules rather than an LLM for clinical recommendations:

- A clinician-entered suspected malaria condition can produce a draft parasitological test suggestion (microscopy or rapid diagnostic test), with a WHO source and the triggering facts.
- Adult lower urinary symptoms with a clinician-entered suspected lower UTI can produce a urinalysis suggestion. A urine culture may be suggested when the clinician records recurrent or complicated-risk context.
- Systolic blood pressure at least 180 mmHg or diastolic at least 120 mmHg produces a prompt to recheck and alert the doctor. It does not establish a diagnosis or determine emergency status.

Other presentations produce no rule-matched recommendation. Previous encounter records are retrieved and shown to the doctor and included as review context, but these rules do not infer disease patterns from history. Suggestions are based on clinician-entered facts and must be reviewed and edited by a doctor before they are sent to the laboratory.

The chosen policy is to use WHO or national guidance only as a draft for clinician review. Current rules cite WHO sources. The WHO AWaRe antibiotic book used for UTI context is the 2022 edition and WHO notes it is being updated. A locally approved national guideline should be configured before relying on these rules in a real facility.

## Out of scope

The app does not diagnose, classify patients as normal, provide a comprehensive urgency triage, or recommend medicines, doses, quantities, or substitutions. Pharmacy stock is not available as a verified structured formulary. These functions require approved protocols, reliable patient safety context, and clinical validation.

## Evaluation

Automated integration tests cover the role handoffs, narrow rule triggers and limits, high-blood-pressure prompt, and stale downstream-stage invalidation. Passing software tests verifies workflow behavior only; it does not establish clinical validity or safety. See [EVALS.md](../09_TESTING/EVALS.md) and [known limitations](../11_MAINTENANCE/KNOWN_LIMITATIONS.md).
