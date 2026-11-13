# Project overview

HealthcareAI2 is a clinical workflow assistance prototype for synthetic hospital workflows, with attention to resource-constrained African hospital settings. It supports role-based encounter handoffs and a small set of transparent WHO-based draft rules; broader AI decision support and a clinically complete patient journey remain future work.

## Intended patient journey

The target is one continuous encounter that follows the patient across six handoffs. The six work areas are attendant/registration, nurse/triage, doctor/initial consultation, laboratory, doctor/results consultation, and pharmacy. The two doctor visits are separate workflow stages and may be handled by different doctors. Staff sign in with role-appropriate demo accounts, enter or review their part of the record, and hand the encounter to the next stage.

At each stage, the agent should assemble the authorized patient history and current encounter facts, make relevant history and patterns easy to review, and offer stage-appropriate suggestions. This includes helping the first doctor consider relevant tests from the reported symptoms and history, helping a later doctor review laboratory findings and the journey so far, and helping pharmacy staff check the prescribed plan and explain recorded instructions. Recommendations must show their supporting facts and uncertainty; licensed staff remain responsible for decisions and actions. The system should raise a prominent escalation alert when a validated, approved protocol indicates urgency, with the triggering inputs visible to staff. Until such protocols are clinically reviewed and implemented, the app must not claim to detect severity or provide reliable urgent-care triage.

The current app supports synthetic registration, patient name search, nurse observations, and sequential consultation, lab, results-consultation, and pharmacy handoff entries with role-specific screens. Doctors can review current and prior visit entries. A small deterministic WHO-based draft can suggest parasite-based malaria testing for clinician-suspected malaria and urinalysis/culture in limited adult lower-UTI scenarios; a very-high-adult-BP prompt asks for repeat reading and immediate clinician review. Nurse vitals are re-screened with deterministic rules on save; a constrained local-model explanation cannot change the assigned category. These outputs are not a full clinical assessment. Cross-visit pattern analysis, broad test/medicine recommendations, dose/substitution recommendations, and validated severity classification are not implemented. See [requirements](REQUIREMENTS.md) and [known limitations](../11_MAINTENANCE/KNOWN_LIMITATIONS.md).

The platform is decision support. Recorded facts, patient reports, historical information, unverified results, model-generated interpretations, and practitioner decisions must remain distinguishable. Clinical decisions remain with qualified practitioners.

## Current state

The initial repository inspection on 2026-11-06 found no implementation. The current stack is Node.js 26, built-in SQLite, LangGraph.js, the official MCP TypeScript SDK, and Ollama HTTP inference. Ten automated tests and the complete local vertical workflow pass. The full hospital journey and clean-machine setup remain outstanding. See the architecture and test-results documents for evidence.
