# Synthetic demo accounts

The local UI provides these synthetic demo accounts:

| Username | Default password | Permission in this slice |
|---|---|---|
| `nurse` | `nurse-demo` | Search for a registered patient and record blood pressure, temperature, and weight. |
| `attendant` | `attendant-demo` | Register a synthetic patient and open an encounter. |
| `doctor` | `doctor-demo` | Record symptoms, examination, requested tests, results-visit assessment, and clinician-written medication order. |
| `laboratory` | `laboratory-demo` | Review requested tests and enter samples and synthetic results. |
| `pharmacist` | `pharmacist-demo` | Record per-item availability, dispensing, alternatives selected by the pharmacist, and counseling. |

The same doctor account is used for both visits; separate doctor identities are not configurable yet. Passwords are local-only and can be changed using the corresponding `DEMO_*_PASSWORD` variables in `.env`. Authentication is not production-grade. The role-specific screens store synthetic workflow data and do not provide clinical AI recommendations. A legacy `practitioner` API account is not shown in the department UI.
