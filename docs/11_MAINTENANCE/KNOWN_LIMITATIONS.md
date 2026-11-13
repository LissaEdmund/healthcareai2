# Known limitations

Updated 2026-11-11.

- The end-to-end registration-to-alert-and-approval workflow passed locally with `qwen2.5:3b`; clean-machine reproducibility has not been checked.
- The legacy completeness protocol only validates presence and numeric type of six fields. A separate draft rule flags adult BP at or above 180 systolic or 120 diastolic for prompt clinician review; it does not classify normality or diagnose hypertensive emergency.
- The attendant can search existing patients by name, but duplicate prevention/identity matching is not guaranteed; verify a patient carefully before registering another record.
- Model semantics are deliberately constrained to structured history/action labels. An earlier free-text response invented a history gap; it was rejected and is now prevented by schema constraints and evidence comparison.
- A borrowed MCP server is not integrated.
- Authentication uses simple demo credentials and loopback-only local sessions. The app is not suitable for production, real patient data, or network deployment.
- Department logins, patient name search, and sequential synthetic handoff entry now exist, with current/prior visit data available to doctors. Deterministic WHO draft rules support malaria parasite testing and limited adult lower-UTI testing; they do not analyze longitudinal patterns to infer recommendations. Medication/dose/substitution recommendations, complete severity alerts, and a verified hospital formulary remain unimplemented. The WHO AWaRe UTI book is the 2022 edition and is being updated.
- `npm start` and persistence after a local service restart were verified. A clean-environment installation/start has not been performed.
- Public repository license, demo video, full documentation tree, and all submission materials remain incomplete.
The automated suite reports 11 passed, 0 failed. See [EVALS.md](../09_TESTING/EVALS.md) for verified workflow evidence and the unresolved duplicate-detection failure.
