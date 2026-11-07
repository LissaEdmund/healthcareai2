import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

const children = [];
let stopping = false;
function start(name, command, args) {
  const child = spawn(command, args, { stdio: 'inherit', env: process.env, windowsHide: true });
  child.on('error', (error) => { if (!stopping) console.error(`${name} failed to start: ${error.message}`); });
  child.on('exit', (code) => { if (!stopping) { console.error(`${name} exited (${code ?? 'signal'})`); shutdown(code || 1); } });
  children.push(child);
  return child;
}
function ollamaExecutable() {
  if (process.env.OLLAMA_EXECUTABLE) return process.env.OLLAMA_EXECUTABLE;
  if (process.platform === 'win32') {
    const installedPath = join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Ollama', 'ollama.exe');
    if (existsSync(installedPath)) return installedPath;
  }
  return process.platform === 'win32' ? 'ollama.exe' : 'ollama';
}
function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (!child.killed) child.kill('SIGTERM');
  setTimeout(() => process.exit(code), 700).unref();
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

async function waitFor(name, url, validate = (response) => response.ok, attempts = 40) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (stopping) throw new Error('Startup interrupted');
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1200) });
      if (await validate(response)) { console.log(`${name} ready at ${url}`); return response; }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${name} did not become ready at ${url}`);
}

try {
  const mcpPort = process.env.MCP_PORT ?? '3001';
  const appPort = process.env.PORT ?? '3000';
  const ollama = process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434';
  const model = process.env.OLLAMA_MODEL ?? 'qwen2.5:3b';
  try {
    await waitFor('Ollama model service', `${ollama.replace(/\/$/, '')}/api/tags`, (r) => r.ok, 1);
  } catch {
    console.log('Starting local Ollama service…');
    start('Ollama', ollamaExecutable(), ['serve']);
    await waitFor('Ollama model service', `${ollama.replace(/\/$/, '')}/api/tags`);
  }
  start('Custom MCP server', process.execPath, ['src/mcp-server.js']);
  await waitFor('Custom MCP server', `http://127.0.0.1:${mcpPort}/health`);
  start('HealthcareAI2 API and frontend', process.execPath, ['src/server.js']);
  await waitFor('HealthcareAI2 API and frontend', `http://127.0.0.1:${appPort}/health`);
  const response = await fetch(`${ollama.replace(/\/$/, '')}/api/tags`);
  const tags = await response.json();
  const available = (tags.models ?? []).some((entry) => entry.name === model || entry.name?.startsWith(`${model}:`));
  if (!available) throw new Error(`Model ${model} is not downloaded. Prepare it with: ollama pull ${model}`);
  console.log(`All services are ready. Open http://127.0.0.1:${appPort}`);
} catch (error) {
  console.error(`Startup failed: ${error.message}`);
  shutdown(1);
}
