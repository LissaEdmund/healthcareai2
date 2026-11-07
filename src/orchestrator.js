import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { db, row, run, audit } from './db.js';
import { REQUIRED_OBSERVATIONS } from './protocol.js';

const State = Annotation.Root({
  encounterId: Annotation(), patientId: Annotation(), observationId: Annotation(), observations: Annotation(), runId: Annotation(),
  context: Annotation(), evaluation: Annotation(), modelOutput: Annotation(), alert: Annotation()
});

async function parseMcpResponse(response) {
  const text = await response.text();
  const isEventStream = response.headers.get('content-type')?.includes('text/event-stream') || text.trimStart().startsWith('event:');
  const payload = isEventStream
    ? text.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).join('\n')
    : text;
  return JSON.parse(payload);
}

async function mcpCall(runId, name, args) {
  const callId = randomUUID();
  const startedAt = new Date().toISOString();
  run('INSERT INTO tool_calls (id, run_id, tool_name, input_json, status, started_at) VALUES (?, ?, ?, ?, ?, ?)', callId, runId, name, JSON.stringify(args), 'started', startedAt);
  audit('agent', 'mcp_tool_started', 'tool_call', callId, { name, args, run_id: runId });
  try {
    const endpoint = `http://127.0.0.1:${process.env.MCP_PORT ?? 3001}/mcp`;
    const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${process.env.MCP_INTERNAL_TOKEN ?? 'local-demo-internal-token'}` };
    const handshake = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'healthcareai2-orchestrator', version: '0.1.0' } } }) });
    if (!handshake.ok) throw new Error(`MCP initialize HTTP ${handshake.status}: ${await handshake.text()}`);
    const initRpc = await parseMcpResponse(handshake);
    if (initRpc.error) throw new Error(initRpc.error.message ?? 'MCP initialize failed');
    await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) });
    const response = await fetch(endpoint, {
      method: 'POST', headers,
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } })
    });
    if (!response.ok) throw new Error(`MCP HTTP ${response.status}: ${await response.text()}`);
    const rpc = await parseMcpResponse(response);
    if (rpc.error) throw new Error(rpc.error.message ?? 'MCP tool failed');
    const result = JSON.parse(rpc.result.content.find((item) => item.type === 'text').text);
    const finishedAt = new Date().toISOString();
    run('UPDATE tool_calls SET output_json = ?, status = ?, finished_at = ? WHERE id = ?', JSON.stringify(result), 'succeeded', finishedAt, callId);
    audit('agent', 'mcp_tool_succeeded', 'tool_call', callId, { name, output: result, run_id: runId });
    return result;
  } catch (error) {
    const finishedAt = new Date().toISOString();
    run('UPDATE tool_calls SET output_json = ?, status = ?, finished_at = ? WHERE id = ?', JSON.stringify({ error: error.message }), 'failed', finishedAt, callId);
    audit('agent', 'mcp_tool_failed', 'tool_call', callId, { name, error: error.message, run_id: runId });
    throw error;
  }
}

export const ExplanationSchema = z.object({
  history_context: z.enum(['none_recorded', 'present']),
  requested_action: z.literal('practitioner_review')
}).strict();

const ModelJsonSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    history_context: { type: 'string', enum: ['none_recorded', 'present'] },
    requested_action: { type: 'string', enum: ['practitioner_review'] }
  },
  required: ['history_context', 'requested_action']
};

export function validateModelOutput(content, context, evaluation, observations) {
  const parsed = ExplanationSchema.safeParse(JSON.parse(content));
  if (!parsed.success) throw new Error(`Model output did not match the allowed explanation schema: ${parsed.error.message}`);
  const result = parsed.data;
  const expectedHistory = context.history?.length ? 'present' : 'none_recorded';
  if (result.history_context !== expectedHistory) throw new Error('Model history label conflicted with retrieved patient context');
  if (result.requested_action !== 'practitioner_review') throw new Error('Model requested an unsupported workflow action');
  return result;
}

const MODEL_SYSTEM_PROMPT = 'You are a constrained workflow routing component in a synthetic clinical workflow demonstration. Return only the provided JSON schema. Set history_context to present only when context.history contains prior encounter records; otherwise none_recorded. requested_action must be practitioner_review. Do not classify observation completeness, write prose, infer, diagnose, recommend treatment, assign risk, or add fields.';

function modelMessages(context, evaluation, observations) {
  return [
    { role: 'system', content: MODEL_SYSTEM_PROMPT },
    { role: 'user', content: JSON.stringify({ context, observations, deterministic_evaluation: evaluation }) }
  ];
}

async function requestModel(messages) {
  const base = process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434';
  const model = process.env.OLLAMA_MODEL ?? 'qwen2.5:3b';
  const result = await fetch(`${base.replace(/\/$/, '')}/api/chat`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, stream: false, format: ModelJsonSchema, messages })
  });
  if (!result.ok) throw new Error(`Local model endpoint returned ${result.status}: ${await result.text()}`);
  const payload = await result.json();
  return { model, content: payload.message?.content ?? 'null' };
}

const graph = new StateGraph(State)
  .addNode('retrieve_context', async (state) => ({ context: await mcpCall(state.runId, 'get_patient_context', { patient_id: state.patientId, encounter_id: state.encounterId }) }))
  .addNode('deterministic_evaluation', async (state) => {
    const evaluation = await mcpCall(state.runId, 'evaluate_clinical_risk', { encounter_id: state.encounterId, observations: state.observations });
    run('UPDATE agent_runs SET evaluation = ? WHERE id = ?', JSON.stringify(evaluation), state.runId);
    return { evaluation };
  })
  .addNode('model_explanation', async (state) => {
    const messages = modelMessages(state.context, state.evaluation, state.observations);
    const modelInput = { model: process.env.OLLAMA_MODEL ?? 'qwen2.5:3b', messages };
    run('UPDATE agent_runs SET model_input = ? WHERE id = ?', JSON.stringify(modelInput), state.runId);
    audit('agent', 'model_invocation_started', 'agent_run', state.runId, modelInput);
    const modelResult = await requestModel(messages);
    try {
      modelResult.output = validateModelOutput(modelResult.content, state.context, state.evaluation, state.observations);
    } catch (error) {
      const rejected = { model: modelResult.model, raw_output: modelResult.content, validation_error: error.message };
      run('UPDATE agent_runs SET model_output = ? WHERE id = ?', JSON.stringify(rejected), state.runId);
      audit('agent', 'model_output_rejected', 'agent_run', state.runId, rejected);
      throw error;
    }
    delete modelResult.content;
    run('UPDATE agent_runs SET model_output = ? WHERE id = ?', JSON.stringify({ model: modelResult.model, ...modelResult.output }), state.runId);
    audit('agent', 'model_output_validated', 'agent_run', state.runId, { model: modelResult.model, output: modelResult.output, clinical_risk_classification: state.evaluation.clinical_risk_classification });
    return { modelOutput: modelResult.output };
  })
  .addNode('draft_alert', async (state) => {
    const evidence = [`protocol:${state.evaluation.protocol_id}@${state.evaluation.protocol_version}`, `observation:${state.observationId}`, `encounter:${state.encounterId}`, `agent_run:${state.runId}`];
    const title = 'Synthetic encounter review requested';
    const recorded = REQUIRED_OBSERVATIONS.filter((field) => state.observations[field] !== undefined && state.observations[field] !== null && state.observations[field] !== '').join(', ') || 'none';
    const missing = [...state.evaluation.missing_observations, ...state.evaluation.invalid_observations].join(', ') || 'none';
    const body = `Synthetic workflow review. Protocol ${state.evaluation.protocol_id}@${state.evaluation.protocol_version} checks required-field completeness only and assigns no clinical risk. Recorded fields: ${recorded}. Missing required fields: ${missing}. History context: ${state.modelOutput.history_context}. Please verify the recorded information and its provenance.`;
    const alert = await mcpCall(state.runId, 'submit_clinical_alert', { encounter_id: state.encounterId, run_id: state.runId, title, body, evidence });
    return { alert };
  })
  .addEdge(START, 'retrieve_context').addEdge('retrieve_context', 'deterministic_evaluation')
  .addEdge('deterministic_evaluation', 'model_explanation').addEdge('model_explanation', 'draft_alert').addEdge('draft_alert', END)
  .compile();

export async function runWorkflow(encounterId, actor) {
  const encounter = row('SELECT id, patient_id FROM encounters WHERE id = ?', encounterId);
  if (!encounter) throw new Error('Encounter not found');
  const observationRecord = row('SELECT id, payload FROM observations WHERE encounter_id = ? ORDER BY created_at DESC LIMIT 1', encounterId);
  if (!observationRecord) throw new Error('Record observations before running the workflow');
  const priorAction = row('SELECT status FROM workflow_actions WHERE observation_id = ?', observationRecord.id);
  if (priorAction && ['running', 'awaiting_approval', 'approved'].includes(priorAction.status)) throw Object.assign(new Error('This observation already has an active or published workflow action'), { status: 409 });
  const observationValues = JSON.parse(observationRecord.payload);
  const runId = randomUUID();
  run(`INSERT INTO workflow_actions (observation_id, encounter_id, run_id, status, updated_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(observation_id) DO UPDATE SET run_id = excluded.run_id, alert_id = NULL, status = excluded.status, updated_at = excluded.updated_at`,
  observationRecord.id, encounterId, runId, 'running', new Date().toISOString());
  run('INSERT INTO agent_runs (id, encounter_id, status, created_at) VALUES (?, ?, ?, ?)', runId, encounterId, 'running', new Date().toISOString());
  audit(actor, 'agent_run_started', 'agent_run', runId, { encounter_id: encounterId });
  try {
    const result = await graph.invoke({ encounterId, patientId: encounter.patient_id, observationId: observationRecord.id, observations: observationValues, runId, context: null, evaluation: null, modelOutput: null, alert: null });
    run('UPDATE agent_runs SET status = ? WHERE id = ?', 'awaiting_practitioner_approval', runId);
    run('UPDATE workflow_actions SET status = ?, updated_at = ? WHERE run_id = ?', 'awaiting_approval', new Date().toISOString(), runId);
    audit(actor, 'agent_run_completed', 'agent_run', runId, { alert_id: result.alert.alert_id, approval_id: result.alert.approval_id });
    return { run_id: runId, context: result.context, evaluation: result.evaluation, model_output: result.modelOutput, alert: result.alert };
  } catch (error) {
    run('UPDATE agent_runs SET status = ? WHERE id = ?', 'failed', runId);
    run('UPDATE workflow_actions SET status = ?, updated_at = ? WHERE run_id = ?', 'failed', new Date().toISOString(), runId);
    audit(actor, 'agent_run_failed', 'agent_run', runId, { error: error.message });
    throw error;
  }
}
