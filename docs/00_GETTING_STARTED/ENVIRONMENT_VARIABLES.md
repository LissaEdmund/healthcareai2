# Environment variables

Copy `.env.example` to `.env` for local development. `src/start.js` reads the file and passes settings to its child processes. Keep `.env` out of version control.

| Variable | Default | Purpose |
|---|---|---|
| `HOST` | `127.0.0.1` | API/UI bind address. Keep loopback for this demonstration. |
| `PORT` | `3000` | API and frontend port. |
| `MCP_PORT` | `3001` | Custom MCP Streamable HTTP port. |
| `DATABASE_PATH` | `./data/healthcareai2.sqlite` | SQLite file location. |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | Local model API endpoint. |
| `OLLAMA_MODEL` | `qwen2.5:3b` | Model name; it must already be available to Ollama before startup readiness passes. |
| `OLLAMA_EXECUTABLE` | Auto-detected | Optional path to the Ollama executable if the startup manager needs to launch it and it is outside the usual Windows install path/PATH. |
| `DEMO_NURSE_PASSWORD` | `nurse-demo` | Local-only synthetic nurse account password. |
| `DEMO_PRACTITIONER_PASSWORD` | `practitioner-demo` | Local-only practitioner account password. |
| `MCP_INTERNAL_TOKEN` | `local-demo-internal-token` | Shared credential between local API orchestration and MCP server. |

These values are for local synthetic demonstrations only. Do not expose the application to a network or use these credentials with real patient data.
