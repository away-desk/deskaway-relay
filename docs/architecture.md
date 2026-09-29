# Architecture — deskaway-relay

## Responsibility

Connects a phone to a desktop that are not on the same network, and keeps a
durable record of what passed between them. It terminates both WebSocket
connections, decides which controller owns a desktop's session, queues approvals
so a decision survives a phone dropping, and writes run transcripts to object
storage.

It is the only always-on component and the only one with persistent state.

## What it deliberately does not do

- **It holds no agent reasoning.** No planning, no classification, no prompt. Task
  text goes to `deskaway-agent` and a plan comes back; the relay is a courier for
  it.
- **It never sees or forwards the model provider key.** Only the agent holds one.
  A desktop must never receive a provider credential from the relay — if a laptop
  could call a model directly, every approval gate in the system becomes optional.
- **It stores nothing in memory that must survive a restart.** Live socket
  bookkeeping only. A deploy kills every instance, so anything that matters is in
  Postgres or Redis.
- **It does not execute commands.** No shell, no desktop, no filesystem to act on.
- **It does not decide what is safe.** Reversibility tiers arrive from the agent;
  scope is enforced on the desktop. The relay carries approval requests and records
  answers without an opinion about them.
- **It does not trust anything it receives.** Both phone and desktop are inbound
  connections from outside. Every frame is validated against `deskaway-protocol`
  before it reaches the domain layer.
- **It does not store a run transcript unredacted.**

Writing the boundary down is what stops it being crossed at 1am six weeks from
now, when forwarding the key "just for this one case" looks like the fast fix.

## Internal pieces, and how a message flows

**`ws/`** — `server` accepts sockets; `router` routes on the envelope alone —
`stamp()` turns an inbound message into an outbound one and is the only place a
relay block is created, and `streamKey()` names the per-session, per-receiver
stream that `sequence` counts in;
`connection-registry` maps devices and sessions to live sockets; `heartbeat`
decides who is still there; `backpressure` handles a consumer too slow to keep up.
Handlers in `ws/handlers/` are thin: validate and delegate.

**`http/`** — the REST surface for everything that is not a live message. Ordered
middleware, each doing one thing: `request-id`, `auth`, `rate-limit`, `body-limit`,
`error-handler`. `openapi/spec.yaml` is the contract.

**`domain/`** — the rules, with no transport or SQL in sight: pairing codes,
session claiming, the approval queue.

**`persistence/`** — Postgres via `repositories/`, with `mappers/` converting rows
to domain types. **`bus/`** — Redis pub/sub for cross-instance delivery.
**`recording/`** — `writer` → `redaction` → `s3-sink`.
**`notifications/push.service`** — wakes a backgrounded phone.

### Flow of one approval

1. A desktop sends `approval-request` over its socket.
2. `ws/server` receives it; `ws/router` reads the envelope type and routes to
   `handlers/approval.handler`.
3. The handler validates against the protocol schema and calls
   `domain/approval/queue.service` — no SQL in the handler.
4. The queue service persists the request through
   `persistence/repositories`, so it survives a restart from this point on.
5. `connection-registry` is asked for the controlling phone's socket. If it is on
   this instance, the frame is written directly. If not, the message is published
   to `bus/` and the instance holding that socket delivers it.
6. If the phone has no live socket, `notifications/push.service` wakes it.
7. The phone's `approval-response` comes back along the same path in reverse. The
   queue service records the decision, then the desktop's socket is found and the
   response forwarded.
8. `recording/writer` appends both messages to the run transcript, which passes
   `redaction` before `s3-sink`.

Every inbound frame follows that shape: **socket → router → handler → domain →
persistence**, with `bus/` bridging instances and `recording/` observing.

## Layering rules

**`domain/` must not import `http/`, `ws/` or `persistence/`.** Dependencies point
inward: transport and storage depend on the domain, never the reverse.

The reason: the rules worth being sure about — who owns a session, whether an
approval has already been answered — are the ones that are painful to test through
a socket and a database. If `domain/` imports a repository, testing session
claiming needs Postgres, and the test that should be three lines becomes a fixture.
The moment that happens, those tests get written less often.

Two supporting rules:

- **Handlers stay thin.** Validate, delegate, respond. Logic in a handler is logic
  reachable only over a socket.
- **`recording/redaction` runs before any sink, never after.** Ordering is the
  guarantee; a sink that redacts on the way out has already had the raw data.

## What it talks to, and in which direction

| Direction | Peer | Over |
| --- | --- | --- |
| **inbound** | `deskaway-android` | WebSocket + REST |
| **inbound** | `deskaway-desktop` | WebSocket + REST (desktop dials out; the relay never connects to it) |
| **outbound** | `deskaway-agent` | HTTP, for planning and classification |
| **outbound** | Postgres | durable state |
| **outbound** | Redis | cross-instance pub/sub |
| **outbound** | S3 | run transcripts |
| **outbound** | push provider | phone wakeups |
| — | `deskaway-protocol` | `@deskaway/protocol`, a git dependency pinned to a commit: generated message types plus the one checker every frame goes through (ADR 0004) |

Both clients dial in; the relay dials out to everything else. It never initiates a
connection to a user's device, so there is no port to reach on anyone's machine.
