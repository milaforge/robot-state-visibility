# Contributing

This repository is a small failure-mode study. Changes should preserve its narrow purpose: making command, observation, delivery, and uncertainty states explicit and testable.

Behavioral changes are expected to include regression coverage, and every change should keep tests, linting, and build checks green.

## Prerequisites

- **Node.js 24**
- **pnpm 10.32.1**, pinned through `packageManager` in [`package.json`](package.json)
- **Python 3.12 or newer**
- [**uv**](https://docs.astral.sh/uv/) for backend dependencies
- **Docker with Compose** for containerized run modes

CI uses Node.js 24 and Python 3.12.

## Repository layout

```text
backend/            FastAPI and WebSocket robot simulator
  app/              protocol, state, simulation, and session logic
  tests/            pytest regression suite

frontend/           React and Vite operator interface
  src/              components, hooks, state logic, and Vitest suites

docs/               architecture and design documentation
res/                README screenshots and demo recording
compose.yml         containerized demo runtime
compose.dev.yml     development overrides with hot reload
.github/workflows/  CI verification
```

Before changing behavior, read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). It explains the invariants and identifies which guarantees are intentionally outside the demo.

## Setup

```sh
pnpm install
cd backend && uv sync --locked
```

## Run

### Containerized demo

```sh
docker compose up --build
```

Open `http://localhost:3000`.

### Containerized development with hot reload

```sh
pnpm dev
```

### Run processes directly

Use separate terminals:

```sh
pnpm backend:dev
```

```sh
pnpm frontend:dev
```

The backend listens on port `8000`. The Vite development server listens on port `5173` and proxies `/ws` to the backend.

## Verify a change

Run the same high-level checks used by CI:

```sh
pnpm test
pnpm lint
pnpm build
```

Available focused commands include:

```sh
pnpm frontend:test:run
pnpm frontend:lint
pnpm frontend:build

pnpm backend:test
pnpm backend:lint
pnpm backend:format
```

## Change rules

### Protect the invariants

The two load-bearing invariants are:

> A command with an external side effect must not be retried merely because its response was lost.

> A message from an expired session epoch must not mutate the current operator state.

A change that weakens either invariant requires explicit discussion and corresponding documentation.

### Add regression coverage

New behavior should be tested at the layer that enforces it:

- backend protocol, lifecycle, execution, ledger, and fault behavior belong in `backend/tests/`;
- frontend state transitions and operator-visible behavior belong in colocated `*.test.ts` or `*.test.tsx` files;
- cross-layer protocol changes usually require tests on both sides.

### Keep protocol definitions synchronized

The wire protocol is represented in:

- [`backend/app/protocol.py`](backend/app/protocol.py);
- the `ServerMessage` and related client types in [`frontend/src/useRobotSocket.ts`](frontend/src/useRobotSocket.ts).

A protocol change should update both definitions, tests, and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

### Update documented scope

When a change resolves or introduces a known limitation, update:

- the README's **Intentionally unresolved** section;
- the architecture document's **Known limitations** section.

Do not leave the documentation implying a guarantee the implementation does not provide.

### Preserve the experiment's scope

Do not add databases, durable queues, authentication, multi-user ownership, or production infrastructure merely to make the simulator appear more realistic.

Such work is appropriate only when the repository's stated purpose is explicitly being revised.

### Keep demo assets current

A visible behavior change should update the relevant image or recording in `res/`.

Keep assets focused on the behavior being reviewed:

- commanded versus observed state;
- connected-but-stale telemetry;
- lost completion and reconciliation.

Avoid decorative screenshots that do not demonstrate an invariant or failure mode.

## Commit conventions

Use Conventional Commits:

```text
feat: add control-ownership epoch check
fix(websocket): reject stale reconciliation event
test(backend): cover duplicate command ID replay
docs: refresh failure-scenario recording
```

Keep each commit limited to one logical change. Do not mix formatting-only churn with behavioral work.

## Pull requests

A pull request should state:

- which failure stage or invariant it changes;
- what operator-visible behavior changes;
- which tests prove the behavior;
- whether any documented limitation was added or resolved.

For visible changes, include a focused screenshot or short recording of the affected scenario.

CI must pass before merge.
