# Architecture

This document is in two parts. **Theory** explains the model the system is built around — why the state is split the way it is and which invariants the design must hold. **Implementation** maps that model onto the actual code: processes, protocol, and the mechanisms that enforce each invariant.

---

## Part 1 — Theory

### The problem: "robot state" is four different claims

An operator dashboard that shows a single "robot state" is quietly merging four claims with different truth conditions:

| Claim | Question it answers | Who can answer it |
| --- | --- | --- |
| **Intent** | What did the operator ask for? | The client, immediately |
| **Command status** | What does the pipeline say happened to that request? | The backend, per command |
| **Observation** | What was the robot last seen doing? | Telemetry, eventually |
| **Freshness** | How old is that observation? | Derived from timestamps, continuously |

When all four agree, collapsing them is harmless. The design question is what the UI shows when they *disagree* — a command acknowledged but never completed, telemetry that stopped arriving, a completion event that was sent but never received. A dashboard that answers with a confident single state is guessing, and a wrong confident answer destroys operator trust in a way a visible "unknown" does not.

The core design decision is therefore: **keep the four claims separate in the protocol and in the UI, and render disagreement as explicit uncertainty.**

### Invariants

Two invariants pin the design (both have regression tests):

1. **Idempotency under retry.** *A command with an external side effect must never be retried merely because its response was lost.* Losing a response tells you nothing about whether the effect happened. The only safe recovery is to ask the authority that executed it, not to re-issue.

2. **Epoch fencing.** *A message from an expired control epoch must never mutate the current operator state.* After a reconnect, messages from the previous connection may still be in flight. If they can overwrite current state, every reconnect is a race.

### The mechanisms, abstractly

Three mechanisms are sufficient to hold both invariants in this system:

- **Client-generated command IDs + a command ledger.** The client names each command with a UUID before sending. The backend records every command it has seen, keyed by that ID, with its latest status and final result. Re-sending a known ID returns the *recorded* outcome — it never re-executes. This makes the command channel idempotent, which makes invariant 1 mechanical rather than disciplinary.

- **Session epochs.** Every connection gets a monotonically increasing epoch number, announced at session start. Every server message carries the epoch it was emitted under. The client drops any message whose epoch is lower than its current one. This is a fencing token: stale producers are excluded by comparison, not by hoping their messages drained.

- **Authoritative reconciliation.** When an outcome is ambiguous (connection lost between acknowledgement and completion), the client parks the command in an explicit **`unknown`** state — retry disabled — and waits. After reconnect, the backend replays the ledger's verdict as a `command_reconciliation` event. Ambiguity is resolved by the ledger, never by client-side inference.

Freshness is handled separately from correctness: every telemetry message carries the time it was observed, and the client continuously classifies its age (`live` / `delayed` / `stale`). Staleness degrades the UI honestly — motion controls lock, the liveness indicator downgrades — while the emergency stop stays available, because "I don't know the current state" is precisely when the operator must still be able to stop the robot.

### What the theory deliberately excludes

- **Durability.** Ledger, epoch counter, and robot state live in process memory. The invariants under study are about *protocol* correctness, not crash recovery; adding persistence would obscure the demo without changing the argument.
- **Control ownership.** Epochs fence *message delivery*, not *command authority*. The backend does not currently reject commands issued under an old epoch — a known gap, tracked as the ❌ cell in the README coverage table.
- **Transport-independent ordering.** In-session ordering rests on the WebSocket (TCP) transport. A `sequence` number is emitted with every state message but not yet checked client-side (a 🟡 cell).

---

## Part 2 — Implementation

### Process topology

Two processes, one WebSocket between them:

```
┌────────────────────────┐   ws://…/ws    ┌─────────────────────────────┐
│  frontend (React/Vite) │◄──────────────►│  backend (FastAPI/uvicorn)  │
│  useRobotSocket hook   │                │  RobotSession per socket    │
│  :5173 (or :3000)      │                │  RobotSimulator (singleton) │
└────────────────────────┘                │  :8000                      │
                                          └─────────────────────────────┘
```

- The **frontend** dev server proxies `/ws` to the backend ([vite.config.ts](../frontend/vite.config.ts)); in compose the UI is published on port 3000. The WebSocket URL is overridable via `VITE_WEBSOCKET_URL`.
- The **backend** has exactly two endpoints ([app/main.py](../backend/app/main.py)): `GET /api/health` and `WS /ws`. There is no database; the simulator is a module-level singleton shared by all connections.

### Backend

Four modules, in dependency order:

| Module | Responsibility |
| --- | --- |
| [protocol.py](../backend/app/protocol.py) | Enums for commands, statuses, faults, message types, robot modes. The vocabulary of the wire protocol. |
| [state.py](../backend/app/state.py) | `Pose` and `RobotState` (commanded pose, actual pose, mode, sequence counter). `create_message()` stamps `sequence` and `observedAtMs` on every `robot_state`. |
| [simulation.py](../backend/app/simulation.py) | `RobotMotion` — stepwise interpolation of moves and rotations, with cancellation hooks; `SimulationConfig` — all timing constants (telemetry interval, motion durations, fault delays). |
| [session.py](../backend/app/session.py) | `RobotSession` (one per WebSocket: accept, receive loop, teardown) and `RobotSimulator` (the shared authority: ledger, epochs, fault injection, telemetry publishing). |

**Session lifecycle.** `RobotSession.run()` accepts the socket and calls `RobotSimulator.start_session()`, which increments `_session_epoch` under a lock and installs this connection's `send` as the *only* delivery channel — a newer connection silently displaces an older one's delivery. The session sends `session_started`, `connection_status: live`, and an immediate `robot_state` snapshot, then flushes any queued stale-completion events. A per-session telemetry task publishes `robot_state` every `telemetry_interval_seconds` (0.5 s).

**The command ledger.** `_handle_command` in [session.py](../backend/app/session.py) is where invariant 1 lives:

1. Reject commands without a `commandId`.
2. **If the ID is already in `_ledger`, replay** — send the recorded final result (as a `command_reconciliation` if finalized, else the current status). No re-execution path exists for a known ID.
3. Otherwise record a `CommandRecord` (ID, command, originating epoch, status) and dispatch.

`emergency_stop` and `reset` execute unconditionally; normal motion is rejected while emergency-stopped or while another command is executing (single active command).

**Message envelope.** `_send_message` stamps every outgoing message with the current `sessionEpoch` before delivery. This is the producer half of invariant 2.

**Fault injection.** Faults are set/cleared by the client via `set_fault` / `clear_fault` and implemented at the point they subvert:

- `telemetry_delay` — the telemetry loop sleeps 1.2 s before sending each snapshot, so `observedAtMs` ages past the client's staleness threshold while the socket stays open.
- `rotation_failure` — `RobotMotion.rotate_right` acknowledges, starts, then emits `FAILED` without changing the actual heading, separating "accepted" from "done."
- `lost_completion_after_execution` — the most involved: on `move_forward`, the backend (a) schedules a timer that completes the movement authoritatively in the ledger even with no client attached, and (b) drops the connection *before* the completion event is delivered. The completion plus its `command_reconciliation` are queued and flushed to whichever session connects next. A `_fault_generation` counter discards delayed telemetry captured under a cleared fault.

### Frontend

State handling is concentrated in one hook; components are presentational.

| File | Responsibility |
| --- | --- |
| [useRobotSocket.ts](../frontend/src/useRobotSocket.ts) | The client-side state machine: connection, epoch fencing, command lifecycle, reconnect (500 ms, or 5 s while a command outcome is unknown so the ambiguous state stays visible), fault toggles. Also defines the `ServerMessage` union — the client's copy of the protocol. |
| [telemetry.ts](../frontend/src/telemetry.ts) | Freshness classification: age > 500 ms → `delayed`, ≥ 1000 ms → `stale`. Recomputed on a 100 ms interval so staleness is detected even when no messages arrive. |
| [App.tsx](../frontend/src/App.tsx) | Composition: wires the hook to the panels, derives which controls are locked. |
| [RobotView.tsx](../frontend/src/RobotView.tsx) | Workcell visualization: renders commanded and actual pose as *distinct* markers plus the liveness indicator — the four-claims separation made visible. |
| [EventLog.tsx](../frontend/src/EventLog.tsx) / [useEventHistory.ts](../frontend/src/useEventHistory.ts) | Operator-facing event log (insertion-ordered, capped at 30 entries). |

**Epoch fencing (consumer half).** The first check in `onmessage` is `isExpired`: any message whose `sessionEpoch` is below the current one is dropped and logged as `ignored event from expired session epoch N`. Only a `session_started` can raise the current epoch. This is invariant 2's enforcement point — one predicate, ahead of all state updates.

**The `unknown` state.** When the socket closes while a command is `acknowledged` or `executing`, the client sets the command status to `unknown`, disables retry, and explains why. It stays there until a `command_reconciliation` for that `commandId` arrives, at which point the ledger's verdict replaces the ambiguity. The client never guesses an outcome and never auto-resends.

### Protocol summary

Client → server: `command` (with `commandId`, `command`, `sessionEpoch`), `set_fault`, `clear_fault`.

Server → client (all stamped with `sessionEpoch`):

| Message | Meaning |
| --- | --- |
| `session_started` | New epoch; the client adopts it as current. |
| `connection_status` | `live` / `disconnected` (the latter also closes the socket server-side). |
| `robot_state` | `sequence`, `observedAtMs`, `mode`, `commandedPose`, `actualPose`. |
| `command_status` | Lifecycle: `acknowledged` → `executing` → `completed` \| `failed` \| `aborted` \| `rejected`. |
| `command_reconciliation` | Ledger verdict for an ambiguous command: `commandId`, `originalSessionEpoch`, `resolvedStatus`, `reason`. |
| `fault_status` | Fault enabled/disabled confirmation. |
| `error` | Unsupported message or fault. |

### Sequence: the lost-completion scenario end to end

```
operator          frontend                    backend (simulator)
   │  move forward   │                             │
   │────────────────►│  command {id, epoch N}      │
   │                 │────────────────────────────►│ ledger[id] = acknowledged
   │                 │◄──── acknowledged, executing│ motion starts; completion
   │                 │                             │ timer scheduled
   │                 │◄──── connection dropped ────│ (fault: before completion)
   │   "UNKNOWN"     │  status → unknown,          │ timer fires: ledger[id] =
   │   retry locked  │  retry disabled             │ completed; event queued
   │                 │── reconnect ───────────────►│ epoch N+1
   │                 │◄─ session_started (N+1) ────│
   │                 │◄─ queued completion ────────│
   │                 │◄─ command_reconciliation ───│ ledger verdict replayed
   │   "COMPLETED    │  ambiguity resolved from    │
   │   (reconciled)" │  the authoritative ledger   │
```

### Where each invariant is enforced and tested

| Invariant | Enforced at | Tested by |
| --- | --- | --- |
| No blind retry of side-effecting commands | Ledger replay in `_handle_command` ([session.py](../backend/app/session.py)); `unknown` state with retry disabled ([useRobotSocket.ts](../frontend/src/useRobotSocket.ts)) | [backend/tests/test_websocket.py](../backend/tests/test_websocket.py) (idempotency, reconciliation); [App.test.tsx](../frontend/src/App.test.tsx) |
| Expired-epoch messages cannot mutate state | `sessionEpoch` stamping in `_send_message` (producer); `isExpired` gate in `onmessage` (consumer) | [App.test.tsx](../frontend/src/App.test.tsx) (expired-epoch rejection) |

### Known gaps

These are deliberate scope cuts, tracked in the README coverage table — read that table before assuming a property holds:

- **No control-ownership model (❌).** The backend never validates a command's epoch against the current one; a superseded connection that is still open can execute commands.
- **`sequence` unchecked (🟡).** In-session ordering relies on TCP; the emitted sequence number is not verified client-side.
- **No command expiry (🟡).** A command delayed in transit executes whenever it arrives.
- **Event log is UI-only (🟡).** No timestamps, capped at 30 entries, no server-side history to reconstruct from.
- **Everything is in-memory (by design).** A backend restart resets ledger, epochs, pose, and faults. See "Demo limitations" in the [README](../README.md).
