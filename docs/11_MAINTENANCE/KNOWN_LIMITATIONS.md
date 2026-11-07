# Known limitations

Updated 2026-11-06.

- The end-to-end registration-to-alert-and-approval workflow passed locally with `qwen2.5:3b`; clean-machine reproducibility has not been checked.
- The deterministic protocol only validates presence and numeric type of six fields. It has no clinical thresholds and is not approved for clinical use.
- Existing-patient detection is not implemented; the API creates a new UUID on each registration request. Add a synthetic identifier and human-reviewed duplicate-candidate flow.
- Model semantics are deliberately constrained to structured history/action labels. An earlier free-text response invented a history gap; it was rejected and is now prevented by schema constraints and evidence comparison.
- A borrowed MCP server is not integrated.
- Authentication uses simple demo credentials and loopback-only local sessions. The app is not suitable for production, real patient data, or network deployment.
- The current single-page workflow is not the complete eleven-screen frontend; the other departments and patient 360 view remain unimplemented.
- `npm start` and persistence after a local service restart were verified. A clean-environment installation/start has not been performed.
- Public repository license, demo video, full documentation tree, and all submission materials remain incomplete.
The automated suite reports 10 passed, 0 failed. See [EVALS.md](../09_TESTING/EVALS.md) for the verified vertical workflow and unresolved duplicate-detection failure.
