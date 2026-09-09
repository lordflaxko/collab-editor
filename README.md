# CodeMesh

A real-time collaborative code editor. Multiple people edit the same project at once with live cursors, chat, inline comments, a shared file tree, and presence — plus a full toolchain built in: sandboxed code execution with interactive stdin, real step-through debugging, Git (commit/branch/diff/review), a Postgres query panel, an HTTP API test panel, static/Node deployment, and an AI assistant for chat and code explanations.

## Stack

- **Client**: React + TypeScript, Vite, CodeMirror 6 (via `y-codemirror.next`)
- **Server**: Node.js, `ws` + `y-websocket` for the Yjs collaboration backend, plain JSON files for accounts/projects/invites/notifications
- **Sync**: [Yjs](https://docs.yjs.dev/) CRDTs over WebSocket — every document, chat thread, comment, and activity log is a shared Yjs type
- **Code execution**: a self-hosted [Piston](https://github.com/engineer-man/piston) instance
- **Containerized features** (Deploy, Install & Run, real debugging): shell out to the `docker` CLI on the host
- **AI features**: Google Gemini API

Built with **TypeScript** (client), **JavaScript** (server), **CSS**, and **HTML**.

## Screenshots

| Landing page | Dashboard |
| --- | --- |
| ![Landing page](docs/screenshots/landing.png) | ![Dashboard](docs/screenshots/dashboard.png) |

**Workspace**, with the Chat and Source Control panels open:

![Workspace](docs/screenshots/workspace.png)

### Languages supported in the editor

Projects created in the app can be written in, run, and formatted in **JavaScript, TypeScript, Python, Java, C++, Rust,** and **Go** — each backed by a real Piston runtime, with server-side formatters (Prettier, `black`, `gofmt`, `rustfmt`, `clang-format`, `google-java-format`) for the Format button.

## Prerequisites

- Node.js 18+
- For the **Run**/**Format** features: a running Piston instance (`piston_api`), reachable at `ws://localhost:2000` by default
- For **Deploy**, **Install & Run**, and real step-through **debugging**: Docker installed and running on the host
- For the **Database** panel: any reachable Postgres instance (the connection string is entered per-session in the UI, nothing to configure server-side)
- For the **AI Assistant** / **Explain** features: a [Gemini API key](https://aistudio.google.com/apikey) (free tier available, no credit card required)

## Setup

```bash
cd server && npm install
cd ../client && npm install
```

### Environment variables

Copy `server/.env.example` to `server/.env` and fill in your key:

```
GEMINI_API_KEY=your-key-here
```

Everything else runs without additional configuration; the AI Assistant and Explain buttons will show a clear "not configured" error until a key is set.

## Running

Start the server and client in separate terminals:

```bash
cd server && npm start   # ws://localhost:1234
cd client && npm run dev # http://localhost:5173
```

Open `http://localhost:5173`, sign up, and create a project.

## Testing

The client has a full Playwright end-to-end suite that drives both the client and server together:

```bash
cd client && npx playwright test
```

Some tests additionally require a running Postgres instance seeded with a `widgets` table (for the Database panel tests) and a running Piston instance (for Run/Format/Test tests) — without those, the corresponding tests fail while the rest of the suite still passes.

## Project structure

```
client/   React app (editor UI, panels, routing)
server/   WebSocket collaboration server + REST endpoints (accounts, projects, git, deploy, AI, etc.)
```
