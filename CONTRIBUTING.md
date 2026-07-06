# Contributing

This repository is a small failure-mode study, but it is maintained with the same hygiene as production code: every change is expected to keep tests, lint, and build green, and behavioral changes are expected to come with a regression test.

## Prerequisites

- **Node.js 24** and **pnpm 10** (the exact pnpm version is pinned via `packageManager` in [package.json](package.json); `corepack enable` picks it up automatically)
- **Python 3.12** and [**uv**](https://docs.astral.sh/uv/) for the backend
- **Docker** with Compose (only needed for the containerized run modes)

## Repository layout

```
backend/            FastAPI + WebSocket robot simulator
  app/              protocol, state, simulation, session logic
  tests/            pytest suite
frontend/           React 19 + Vite operator UI
  src/              components, hooks, and their Vitest suites
docs/               design notes and architecture documentation
compose.yml         production-like containers
compose.dev.yml     dev overrides (hot reload, bind mounts)
.github/workflows/  CI (test, lint, build for both sides)
```

Before changing behavior, read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — it explains the invariants this project exists to demonstrate and which parts of the code enforce them.

## Getting started

```sh
pnpm install                 # frontend workspace dependencies
cd backend && uv sync        # backend virtualenv + dependencies
```

### Running locally

Two equivalent options:

```sh
# Containerized, with hot reload on both sides
pnpm dev

# Or run the processes directly
pnpm backend:dev             # uvicorn on :8000
pnpm frontend:dev            # vite on :5173, proxies /ws to the backend
```

The containerized UI is served at http://localhost:3000; the bare Vite dev server at http://localhost:5173.

## Verifying your change

CI runs exactly these three commands ([.github/workflows/ci.yml](.github/workflows/ci.yml)); run them before pushing:

```sh
pnpm test    # vitest run + pytest
pnpm lint    # eslint + ruff check
pnpm build   # tsc -b + vite build
```

Per-side variants exist for faster iteration: `pnpm frontend:test`, `pnpm backend:test`, `pnpm backend:lint`, etc. Format backend code with `pnpm backend:format` (ruff).

## What a good change looks like

- **Protect the invariants.** The two invariants in the [README](README.md#invariants) (no retry of side-effecting commands on lost responses; no state mutation from expired epochs) are load-bearing. A change that weakens either needs an explicit discussion, not a quiet edit.
- **Tests accompany behavior.** New failure scenarios or protocol changes need a regression test on the side that enforces them — backend tests live in [backend/tests/](backend/tests/), frontend tests sit next to the code they cover (`*.test.tsx` / `*.test.ts`).
- **Keep the protocol in sync.** Message types are defined twice by design: [backend/app/protocol.py](backend/app/protocol.py) and the `ServerMessage` union in [frontend/src/useRobotSocket.ts](frontend/src/useRobotSocket.ts). Any protocol change must update both, plus the architecture doc if the message flow changes.
- **Update the coverage table.** If your change moves a cell in the README coverage matrix (✅ / 🟡 / ❌), update the table and the "Why each 🟡 / ❌" section in the same commit.
- **No new persistence.** In-memory state is intentional (see "Demo limitations" in the README). Don't add databases or durable queues to make a scenario "more realistic."

## Commit conventions

Use [Conventional Commits](https://www.conventionalcommits.org/), matching the existing history:

```
feat: add control-ownership epoch check
fix(websocket): reconnect after server-initiated close
chore(docs): refine readme
test(backend): cover duplicate commandId replay
```

Keep commits scoped to one logical change. Don't mix formatting-only churn with behavior changes.

## Pull requests

- Branch from `main`; CI must pass (it runs on every PR).
- Describe **which failure scenario or invariant** the change touches, not just what code moved.
- If the change is visible in the UI, a short screen capture of the relevant scenario helps review considerably.
