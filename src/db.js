import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

const dbPath = resolve(process.env.DATABASE_PATH ?? './data/healthcareai2.sqlite');
mkdirSync(dirname(dbPath), { recursive: true });
export const db = new DatabaseSync(dbPath);
db.exec(`
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS patients (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, date_of_birth TEXT NOT NULL,
  sex TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS encounters (
  id TEXT PRIMARY KEY, patient_id TEXT NOT NULL REFERENCES patients(id),
  status TEXT NOT NULL DEFAULT 'triage', created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS observations (
  id TEXT PRIMARY KEY, encounter_id TEXT NOT NULL REFERENCES encounters(id),
  payload TEXT NOT NULL, recorded_by TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY, encounter_id TEXT NOT NULL REFERENCES encounters(id),
  status TEXT NOT NULL, evaluation TEXT, model_input TEXT, model_output TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY, encounter_id TEXT NOT NULL REFERENCES encounters(id),
  status TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL,
  evidence TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY, alert_id TEXT NOT NULL UNIQUE REFERENCES alerts(id),
  status TEXT NOT NULL DEFAULT 'pending', requested_by TEXT NOT NULL,
  decided_by TEXT, decision_reason TEXT, created_at TEXT NOT NULL, decided_at TEXT
);
CREATE TABLE IF NOT EXISTS tool_calls (
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES agent_runs(id),
  tool_name TEXT NOT NULL, input_json TEXT NOT NULL, output_json TEXT,
  status TEXT NOT NULL, started_at TEXT NOT NULL, finished_at TEXT
);
CREATE TABLE IF NOT EXISTS audit_log (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL UNIQUE,
  actor TEXT NOT NULL, action TEXT NOT NULL, resource_type TEXT NOT NULL,
  resource_id TEXT, details TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY, username TEXT NOT NULL, role TEXT NOT NULL,
  expires_at TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS workflow_actions (
  observation_id TEXT PRIMARY KEY REFERENCES observations(id),
  encounter_id TEXT NOT NULL REFERENCES encounters(id), run_id TEXT NOT NULL, alert_id TEXT,
  status TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS alert_submissions (
  run_id TEXT PRIMARY KEY REFERENCES agent_runs(id), alert_id TEXT NOT NULL UNIQUE REFERENCES alerts(id)
);
CREATE INDEX IF NOT EXISTS idx_encounters_patient ON encounters(patient_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_log(resource_type, resource_id, sequence);
`);
const agentRunColumns = new Set(db.prepare('PRAGMA table_info(agent_runs)').all().map((column) => column.name));
if (!agentRunColumns.has('model_input')) db.exec('ALTER TABLE agent_runs ADD COLUMN model_input TEXT');

export function audit(actor, action, resourceType, resourceId, details = {}) {
  db.prepare(`INSERT INTO audit_log (event_id, actor, action, resource_type, resource_id, details, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(randomUUID(), actor, action, resourceType, resourceId, JSON.stringify(details), new Date().toISOString());
}
export function rows(sql, ...params) { return db.prepare(sql).all(...params); }
export function row(sql, ...params) { return db.prepare(sql).get(...params); }
export function run(sql, ...params) { return db.prepare(sql).run(...params); }
