# AGENT.md — deskaway-relay

The cloud broker. Every message between a phone and a desktop passes through
here: it terminates both WebSocket connections, owns pairing and session
claims, queues approvals, and records runs. It is the only component that
talks to Postgres, Redis and S3.

It is also the only always-on service, so it carries the system's
availability and security burden. Assume every inbound frame is hostile and
every downstream is flaky.

## Folder structure

```
.github/
  CODEOWNERS
  pull_request_template.md
  workflows/
    ci.yml  build-push.yml  deploy.yml  security.yml
src/
  main.ts                 # process entrypoint, wiring, shutdown
  config/
    schema.ts             # env var contract
    load.ts               # parse + validate at boot, fail fast
  http/
    server.ts
    routes/               # auth, devices, pairing, sessions, runs, health
    middleware/           # request-id, auth, rate-limit, body-limit,
                          #   error-handler
    openapi/spec.yaml     # REST surface, source of truth
  ws/
    server.ts  router.ts  # accept sockets, dispatch by envelope type
    connection-registry.ts# live sockets by device and session
    heartbeat.ts          # liveness, idle eviction
    backpressure.ts       # slow-consumer handling
    handlers/             # pairing, control, task, command, approval
  domain/                 # business rules, no transport or SQL
    pairing/              # code-generator, pairing.service
    session/claim.service # one desktop, one active controller
    approval/queue.service
    account/  device/  run/
  persistence/
    client.ts             # Postgres pool
    repositories/         # queries, one per aggregate
    mappers/              # row <-> domain, keep them dumb
  bus/
    redis-pubsub.ts  channels.ts  subscriber.ts   # cross-instance fanout
  recording/
    writer.ts  s3-sink.ts  redaction.ts           # run transcripts
  notifications/push.service.ts                   # phone wakeups
  observability/  logger.ts  metrics.ts  tracing.ts
  secrets/secrets-manager.ts
  platform/               # process-level glue
migrations/               # forward-only SQL, timestamp-prefixed
scripts/                  # dev and ops helpers
test/
  unit/  integration/  contract/  e2e/  load/
docker/
  Dockerfile  .dockerignore  docker-compose.dev.yml  # local pg + redis
docs/
  local-setup.md  runbook.md  adr/
.env.example              # every var in config/schema.ts, no real values
.nvmrc                    # pinned Node version
```

Directories holding only a `.gitkeep` are agreed structure with no content
yet.

## Conventions

- `domain/` never imports from `http/`, `ws/` or `persistence/`. Transport
  and storage depend on the domain, not the reverse.
- Envelope shapes come from `deskaway-protocol`. Never hand-roll a message
  type here; if a shape is wrong, fix it there.
- Migrations are forward-only. Never edit a migration that has run anywhere.
- Every new env var lands in `config/schema.ts` and `.env.example` in the
  same commit. Boot must fail loudly on a missing one.
- Recordings pass through `recording/redaction.ts` before any sink. Nothing
  reaches S3 unredacted.
- Never commit a real `.env`. `.env.example` carries names and dummy values.

## Rule: keep README.md current

The README is the one file a newcomer is guaranteed to read. Revisit it
whenever this repo's answer to any of the four questions below changes — not
on a schedule.

Every DeskAway README answers four things, in this order:

1. **What this one repo is**, in two lines, and where it sits in the whole
   system.
2. **Its current status**, stated honestly. Right now that is *early
   development, nothing works yet.*
3. **How to run it locally**, aiming for under ten minutes.
4. **A link back** to the org or to `deskaway-docs`, so someone landing here
   can find the rest.

How to apply it:

- Keep those four as the first four sections, in that order. Anything else
  goes after them.
- Status rots fastest. The moment the first thing in this repo actually
  runs, that line changes in the same PR. "Nothing works yet" is honest
  only until it isn't.
- If a setup step breaks, or creeps past ten minutes, fix the README in the
  PR that caused it. A stale run section is worse than no run section.
- Never write intent as if it were fact. Anything not yet true is either
  labelled as planned or left out entirely.
- Two lines means two lines. If section 1 needs a third paragraph, that
  content belongs in `deskaway-docs`.
