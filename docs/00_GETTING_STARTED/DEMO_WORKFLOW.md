# Department workflow demonstration

Start with `npm.cmd start` and open `http://127.0.0.1:3000`. All records in this walkthrough must be synthetic.

1. Sign in as `attendant` / `attendant-demo`. Search by patient name first. Register a new patient if no matching record is found. Registration opens a visit automatically; the attendant screen does not display an encounter ID.
2. Sign out and sign in as `nurse` / `nurse-demo`. Search for and select the patient, record systolic/diastolic blood pressure, temperature, and weight, then save. The saved visit becomes available to the doctor.
3. Sign in as `doctor` / `doctor-demo`. Search for the patient, review the visit history and nurse entries, enter symptoms, clinician-suspected conditions, relevant history/risk context, and examination notes. Select **Save consultation notes and run test draft**. Review the cited WHO draft suggestions, select or remove suggestions, edit the final test list, then save to send the request to the laboratory.
4. Sign in as `laboratory` / `laboratory-demo`. Search for the patient, review requested tests, record samples taken and results, and save to return the results to the doctor.
5. Sign in as `doctor` again. Search for the patient, review the full visit and past recorded visits, enter the clinician assessment and medication order, and save to send it to pharmacy. No medication-choice or dose draft is produced in this version.
6. Sign in as `pharmacist` / `pharmacist-demo`. Search for the patient, review each ordered medicine, record availability and quantity supplied, note any pharmacist-selected alternative, enter the instructions explained, and complete dispensing.

Each stage requires the preceding handoff. Saved data records the staff username and timestamp. Editing an earlier stage clears later entries so the journey cannot show stale downstream results.

## AI and clinical boundary

The build includes a small, deterministic WHO-guideline test-draft rule set for clinician-entered suspected malaria and adult lower UTI, plus an adult very-high-blood-pressure prompt based on WHO's hypertension fact sheet. It does not use the LLM for these suggestions, and it does not classify a patient as normal, diagnose, provide medication/dose/substitution recommendations, or determine a complete emergency status. Every suggestion shows its source and supporting facts and requires doctor review. The WHO AWaRe UTI material is the 2022 edition and WHO says it is being updated. Local/national guidance and hospital formulary data are still needed before broader test or medication support.
