# Troubleshooting

## PowerShell says npm scripts are disabled

Use the Windows command shim: `npm.cmd install`, `npm.cmd test`, and `npm.cmd start`.

## `npm start` cannot find the model service

Install Ollama using its official Windows installer, run `ollama pull qwen2.5:3b`, then retry `npm.cmd start`. The launcher checks the configured model tag in Ollama before reporting readiness.

## The agent returns `fetch failed`

The graph could not reach `OLLAMA_BASE_URL`. Check that Ollama is running, its API is reachable at the configured address, and the model is downloaded. This failure occurred during early development before Ollama was installed; the completed local workflow now passes.

## MCP calls return 401

Ensure `MCP_INTERNAL_TOKEN` is the same for the backend and MCP process. Restart both after editing `.env`.

## Port already in use

Stop existing `node src/server.js` and `node src/mcp-server.js` processes before using `npm.cmd start`, or update `PORT` and `MCP_PORT` in `.env`.

## The browser reports sign-in required

Use the demo accounts in [DEMO_ACCOUNTS](DEMO_ACCOUNTS.md). Nurse users can record observations; only practitioners can approve or reject an alert.

## The database needs resetting

The demo database is `data/healthcareai2.sqlite`. Stop services before moving or removing it. It contains synthetic data; no migration command exists yet because startup creates tables using idempotent schema statements.
