import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { db, row, rows, run, audit } from './db.js';
import { evaluateObservations, PROTOCOL_ID, PROTOCOL_VERSION } from './protocol.js';

const port = Number(process.env.MCP_PORT ?? 3001);
const internalToken = process.env.MCP_INTERNAL_TOKEN ?? 'local-demo-internal-token';
function createMcpServer() {
  const mcp = new McpServer({ name: 'healthcareai2-custom-tools', version: '0.1.0' });
  mcp.tool('get_patient_context', 'Retrieve authorized synthetic patient and encounter context.', {
  patient_id: z.string().uuid(), encounter_id: z.string().uuid()
}, async ({ patient_id, encounter_id }) => {
  const patient = row('SELECT id, name, date_of_birth, sex FROM patients WHERE id = ?', patient_id);
  const encounter = row('SELECT id, patient_id, status, created_at FROM encounters WHERE id = ?', encounter_id);
  if (!patient || !encounter || encounter.patient_id !== patient_id) throw new Error('Patient or encounter not found for this context request');
  const observations = rows('SELECT payload, recorded_by, created_at FROM observations WHERE encounter_id = ? ORDER BY created_at', encounter_id).map((o) => ({ ...JSON.parse(o.payload), recorded_by: o.recorded_by, recorded_at: o.created_at }));
  const context = { patient, encounter, observations, history: [], history_note: 'No prior encounter history is stored in this initial synthetic workflow.' };
  return { content: [{ type: 'text', text: JSON.stringify(context) }] };
  });

  mcp.tool('evaluate_clinical_risk', 'Run the versioned synthetic observation completeness protocol. It does not classify clinical risk.', {
    encounter_id: z.string().uuid(), observations: z.record(z.string(), z.union([z.number(), z.string()]))
  }, async ({ encounter_id, observations }) => {
  const encounter = row('SELECT id FROM encounters WHERE id = ?', encounter_id);
  if (!encounter) throw new Error('Encounter not found');
  const result = evaluateObservations(observations);
  result.protocol_id = PROTOCOL_ID;
  result.protocol_version = PROTOCOL_VERSION;
  return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  });

  mcp.tool('submit_clinical_alert', 'Create a pending, practitioner-reviewable alert draft. This never executes or confirms a clinical action.', {
  encounter_id: z.string().uuid(), run_id: z.string().uuid(), title: z.string().min(1).max(120),
  body: z.string().min(1).max(2000), evidence: z.array(z.string()).max(20)
}, async ({ encounter_id, run_id, title, body, evidence }) => {
  const runRecord = row('SELECT evaluation FROM agent_runs WHERE id = ? AND encounter_id = ?', run_id, encounter_id);
  if (!runRecord || !runRecord.evaluation) throw new Error('A persisted deterministic evaluation is required before alert submission');
  const prior = row('SELECT a.id AS alert_id, ap.id AS approval_id, a.status FROM alert_submissions s JOIN alerts a ON a.id = s.alert_id JOIN approvals ap ON ap.alert_id = a.id WHERE s.run_id = ?', run_id);
  if (prior) return { content: [{ type: 'text', text: JSON.stringify({ alert_id: prior.alert_id, approval_id: prior.approval_id, status: prior.status, duplicate: true }) }] };
  const alertId = randomUUID();
  const approvalId = randomUUID();
  const createdAt = new Date().toISOString();
  db.exec('BEGIN IMMEDIATE');
  try {
    run('INSERT INTO alerts (id, encounter_id, status, title, body, evidence, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', alertId, encounter_id, 'pending_approval', title, body, JSON.stringify(evidence), createdAt);
    run('INSERT INTO approvals (id, alert_id, status, requested_by, created_at) VALUES (?, ?, ?, ?, ?)', approvalId, alertId, 'pending', 'agent', createdAt);
    run('INSERT INTO alert_submissions (run_id, alert_id) VALUES (?, ?)', run_id, alertId);
    audit('agent', 'alert_approval_requested', 'alert', alertId, { run_id, approval_id: approvalId, evidence });
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  run('UPDATE workflow_actions SET alert_id = ?, status = ?, updated_at = ? WHERE run_id = ?', alertId, 'awaiting_approval', createdAt, run_id);
  return { content: [{ type: 'text', text: JSON.stringify({ alert_id: alertId, approval_id: approvalId, status: 'pending_approval' }) }] };
  });
  return mcp;
}

const http = createServer(async (req, res) => {
  if (req.url === '/health' && req.method === 'GET') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ status: 'ok', service: 'custom-mcp' })); return; }
  if (req.url !== '/mcp') { res.writeHead(404).end(); return; }
  if (req.headers.authorization !== `Bearer ${internalToken}`) { res.writeHead(401).end('Unauthorized'); return; }
  try {
    const mcp = createMcpServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await mcp.connect(transport);
    await transport.handleRequest(req, res);
    res.on('close', () => { void transport.close(); });
  } catch (error) {
    if (!res.headersSent) { res.writeHead(500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: error.message })); }
  }
});
http.listen(port, '127.0.0.1', () => console.log(`HealthcareAI2 MCP listening on http://127.0.0.1:${port}/mcp`));
process.on('SIGINT', () => { http.close(); db.close(); process.exit(0); });
process.on('SIGTERM', () => { http.close(); db.close(); process.exit(0); });
