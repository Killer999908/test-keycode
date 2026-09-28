# KEYCODE Desktop + CLI

One runtime, three surfaces: **web** (browser), **desktop** (Windows/macOS/Linux app), and **terminal** (`kc` agent).

---

## 🖥️ Desktop app (Windows / macOS / Linux)

Electron shell that boots the real Node server and opens the AI Builder in a native window.

### Dev run
```bash
npm install            # includes electron + electron-builder
npm --prefix server install
npm run desktop        # or: npm run desktop:dev (builds frontend first)
```

### Build installers
```bash
npm run dist:win       # NSIS installer (.exe) — Windows x64
npm run dist:mac       # DMG — macOS Intel + Apple Silicon
npm run dist:linux     # AppImage + .deb — Linux x64
npm run dist           # current platform, all defaults
```
Output lands in `desktop-dist/`.

### Install from terminal (Linux)
```bash
chmod +x KEYCODE-Studio-*.AppImage
./KEYCODE-Studio-*.AppImage          # run directly
# or the .deb:
sudo dpkg -i keycode-studio_*.deb
```

### Windows / macOS install
Run the built installer (`KEYCODE Studio Setup.exe` / `KEYCODE-Studio.dmg`) — standard per-user install, desktop shortcut included.

---

## ⌨️ `kc` — the terminal agent

Same 46-tool ReAct runtime as the web builder, no server required.

### Install globally
```bash
cd keycode-alien-interface
npm link          # exposes `kc` on your PATH
# or from npm, once published:
npm i -g keycode-alien-interface
```

### Commands
```
kc chat                      interactive session (/yolo, /exit)
kc run "task"                one-shot task
kc run --yolo "task"         FULL AUTONOMY — no permission prompts
kc run --steps 30 "task"     longer budget
kc serve [--port 5000]       run the full web server
kc tools                     print the tool catalog
kc status                    health-check the 9 AI routers
kc mcp                       MCP connector status
```

### Permission model
By default the agent **asks before** file edits, code execution, sub-agents,
and packaging. Approve once per tool per run; `a`/`always` sticks for the run.
- `--yolo` — auto-approve everything (full autonomy)
- `--allow code_run,file_edit` — pre-approve specific tools
- Piped/non-TTY stdin **fails closed** — never silently auto-approves

### Configuration
`kc` loads env from (first match wins):
1. `./.env` — current directory
2. `~/.kcenv` — your global agent config
3. bundled `server/.env`

Keys: `GROQ_API_KEY`, `DEEPSEEK_API_KEY`, `MISTRAL_API_KEY`,
`OPENROUTER_API_KEY`, `GEMINI_API_KEY`, `HF_TOKEN`, `OLLAMA_URL`,
`DIFY_URL`/`DIFY_KEY`, `LANGFLOW_URL`/`LANGFLOW_KEY`, …

Free-tier-friendly: Groq + Gemini + HuggingFace + local Ollama all work
without paying anything.

---

## 🔌 MCP + connectors (30 tools)

Built-in connectors (native fallbacks — work even without MCP servers installed):

| Group | Tools |
|---|---|
| GitHub | repo, issues, code search |
| Git local | status, log, diff, branches, staging |
| Filesystem | list, read, write, search |
| Brave Search | live web search |
| Fetch | URL → readable text |
| Browser | navigate, screenshot (Playwright/Puppeteer) |
| PostgreSQL | read-only SQL, schema |
| Redis | get/set/keys/ttl |
| Slack | post message, list channels |
| Jira | search, get, create |
| Confluence | search, read page |

Point external MCP servers at the same registry: any stdio JSON-RPC 2.0
server can be hosted in-process (see `server/agent/mcpClient.js`).

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────┐
│  surfaces: web / desktop / terminal     │
├─────────────────────────────────────────┤
│  server/server.js   (Express + SSE)     │
│  server/agent/      (ReAct runtime)     │
│    ├ reactEngine.js   think→act→observe │
│    ├ toolDispatch.js  46-tool registry  │
│    ├ advancedTools.js edits/checkpoints │
│    ├ mcpClient.js     MCP + connectors  │
│    └ sandbox.js       ephemeral ws      │
│  server/services/   9-provider router   │
└─────────────────────────────────────────┘
```

- **Desktop**: Electron `main.js` spawns the server child
  (`ELECTRON_RUN_AS_NODE=1`), waits for `/api/health`, then opens
  `ai-builder.html` in a sandboxed window.
- **CLI**: imports the agent runtime directly — no HTTP, no Mongo needed
  for agent runs.
- **Web**: `npm start` → http://localhost:5000
