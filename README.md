# CodeMesh

A real-time collaborative code editor. Several people open the same project and edit it at once — live cursors, presence, chat, and inline comment threads — with a full toolchain in the same tab: sandboxed execution with an interactive terminal, real step-through debugging, Git with pull requests, a Postgres query panel, an HTTP API tester, one-click deploys, and an AI assistant.

![CodeMesh landing page](docs/screenshots/landing.png)

## Features

**Collaboration**
- Live multi-cursor editing backed by [Yjs](https://docs.yjs.dev/) CRDTs — no operational-transform server, no lock contention, and edits merge cleanly even after a disconnect
- Presence avatars, join/leave toasts, and a per-room chat with @mentions, threaded replies, and emoji reactions
- Inline comment threads anchored to code ranges, with resolve and reactions
- An activity log of file, commit, and membership events
- Notifications for mentions

**Editing**
- Multi-file projects with a shared file tree
- Autocomplete, Go to Symbol, Ctrl+click go-to-definition, and Find in Files — all indexed across every file in the project, not just the open one
- A command palette (`⌘K` / `Ctrl+K`)
- Server-side formatting per language
- Save any project as a reusable template

**Running code**
- **Run** — executes against a self-hosted [Piston](https://github.com/engineer-man/piston) runtime with an interactive stdin terminal, so programs that prompt for input actually work
- **Install & Run** — resolves npm dependencies inside a container
- **Debug** — real step-through debugging over the Chrome DevTools Protocol: breakpoints, logpoints, step-over, resume, and live inspection of variables in scope, against an actual Node process paused in a container
- **Tests** — runs a test file and reports pass/fail per case

**Git**
- Commit, branch, diff, and browse history without leaving the editor
- Review requests with a diff against a base branch, and approvals
- Push to a GitHub remote, and list or open real pull requests through the GitHub API
- **Automatic checkpoints** — uncommitted live edits are periodically committed on their own, so "restore a previous version" can reach work nobody thought to commit

**Everything else**
- Postgres query panel (read-only, connection string entered per session and never stored)
- HTTP API test panel
- Deploy a static site or a Node server to a live URL, backed by a real container
- AI assistant for room-wide questions, plus **Explain** on any selection
- Roles (`viewer` / `editor` / `admin` / `owner`), invite links scoped to a role, public/private projects, and a public gallery
- Export any project as a `.zip`
- Light / dark / system themes

### Dashboard

![Dashboard](docs/screenshots/dashboard.png)

### Workspace

The activity rail on the left switches the side panel — one at a time, like an IDE sidebar. Here Source Control is open next to a run that has just finished.

![Workspace](docs/screenshots/workspace.png)

## Languages

**JavaScript, TypeScript, Python, Java, C++, Rust,** and **Go** — each backed by a real Piston runtime, with server-side formatters (Prettier, `black`, `gofmt`, `rustfmt`, `clang-format`, `google-java-format`) behind the Format button.

## Stack

- **Client** — React 19 + TypeScript, Vite, CodeMirror 6 (via `y-codemirror.next`), and a design system of HSL CSS custom properties driving light/dark themes (Tailwind is configured and available, but the components are styled with the hand-written stylesheet)
- **Server** — Node.js, `ws` + `y-websocket`, with accounts/projects/invites/notifications in plain JSON files
- **Sync** — Yjs CRDTs over WebSocket. Every document, chat thread, comment, and activity entry is a shared Yjs type, so the server stays a relay rather than a source of truth
- **Execution** — a self-hosted Piston instance; the containerised features (Deploy, Install & Run, debugging) shell out to the `docker` CLI on the host
- **AI** — Google Gemini

## Prerequisites

- Node.js 18+
- **Docker**, for Deploy, Install & Run, and step-through debugging
- A **Piston** instance for Run / Format / Tests — reachable at `localhost:2000` by default
- A reachable **Postgres** instance, only for the Database panel (the connection string is entered in the UI; nothing to configure server-side)
- A [**Gemini API key**](https://aistudio.google.com/apikey) for the AI Assistant and Explain (free tier, no card required)

None of these are hard requirements to boot the app — without them, the corresponding features surface a clear "not configured" error and everything else keeps working.

## Setup

```bash
cd server && npm install
cd ../client && npm install
```

### Environment variables

Copy `server/.env.example` to `server/.env`. Every variable is optional and falls back to a working default:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `1234` | Server port |
| `CLIENT_URL` | `http://localhost:5173` | Used to build links inside password-reset emails |
| `GEMINI_API_KEY` | — | Enables the AI Assistant and Explain |
| `GEMINI_MODEL` | `gemini-3.8-flash` | Model used for AI features |
| `RESEND_API_KEY` | — | Enables password-reset emails ([Resend](https://resend.com/api-keys) sandbox sending needs no DNS setup) |
| `RESEND_FROM` | `CodeMesh <onboarding@resend.dev>` | From address for those emails |
| `PISTON_WS_URL` | `ws://localhost:2000/api/v2/connect` | Interactive runs (stdin) |
| `PISTON_HTTP_URL` | `http://localhost:2000/api/v2/execute` | Test runs |
| `YPERSISTENCE` | `server/data` | On-disk Yjs document storage |

The client reads one variable, `VITE_SERVER_URL` (default `http://localhost:1234`) — set it to point a build at a non-local server.

### Piston

```bash
docker run -d --name piston_api --privileged \
  -p 2000:2000 -v piston_packages:/piston/packages \
  ghcr.io/engineer-man/piston
```

Then install the language runtimes you want through the Piston API. Formatters are installed separately:

```bash
cd server && npm run setup-formatters
```

## Running

In two terminals:

```bash
cd server && npm start    # ws://localhost:1234
cd client && npm run dev  # http://localhost:5173
```

Open `http://localhost:5173`, sign up, and create a project. To try collaboration, open the same project in a second browser profile, or generate an invite link from **Members**.

## Testing

A Playwright end-to-end suite of **72 specs** drives the real client and server together — two browser contexts editing simultaneously, real containers, real git operations:

```bash
cd client && npx playwright test
```

Some specs need supporting services: Piston (Run/Format/Test), Docker (Deploy/Debug), a Postgres instance seeded with a `widgets` table (Database panel), and API keys for the AI and password-reset specs. Without those, the corresponding specs fail while the rest of the suite passes.

## Project structure

```
client/   React app — editor, panels, routing, design system
  src/
  tests/  Playwright end-to-end suite
server/   WebSocket collaboration server + REST endpoints
          (accounts, projects, git, deploy, database, AI, email)
docs/     Screenshots
```
