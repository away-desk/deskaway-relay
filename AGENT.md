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

## Rule: keep CHANGELOG.md current

Add a line the moment you do something notable — not at release time. The
changelog is cheap to maintain one entry at a time and miserable to
reconstruct from five months of git log.

- Format is [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
  versioning is [SemVer](https://semver.org/spec/v2.0.0.html).
- Everything lands under `## [Unreleased]`, grouped by `### Added`,
  `Changed`, `Deprecated`, `Removed`, `Fixed`, or `Security`. Create a group
  when you first need it.
- "Notable" means a reader of this repo would want to know: a new capability,
  a behaviour change, a dependency that changes how you run it, a security
  fix. Not: formatting, a typo, an internal rename nobody outside the file
  can see.
- Write for someone who has not read the diff. "Added pairing code
  expiry" beats "updated code-generator.ts".
- On a release, rename `[Unreleased]` to the version with the date, and open
  a fresh empty `[Unreleased]` above it. Never delete history.
- Entries are past tense and one line. If yours needs a paragraph, it is
  probably two entries.

## Rule: keep the pull request template useful

`.github/pull_request_template.md` pre-fills every PR description. While this
project is one person reviewing their own work, it is the self-check that
catches what you were about to skip — so fill it in honestly rather than
deleting the prompts.

- Answer all four. "N/A" is a fine answer; a blank section is not.
- **Which unit of the plan this belongs to** is the one that pays off later.
  In five months this is how you find which PR did what, so name the unit,
  not the file you touched.
- **Anything deliberately left incomplete** is not an admission. An
  acknowledged gap is a decision; an unmentioned one is a bug you will
  rediscover.
- Change the template when a prompt stops earning its place, and keep it at
  four or five. A template long enough to skim past is worse than none.

## Rule: keep CONTRIBUTING.md short

It is currently five lines because there are no outside contributors. Resist
growing it for people who do not exist yet.

- Update it when the real answer changes: the formatter command, the branch
  rule, or the day the project starts accepting outside contributions.
- Anything longer than a few lines is either repo guidance — which belongs in
  this file — or cross-repo process, which belongs in `deskaway-docs`.

## Rule: keep SECURITY.md honest

One line in it will become false, and it is the important one.

- The supported-versions table says *nothing is supported, do not run this*.
  The day a version is tagged, that table changes in the same PR — an
  unsupported-looking project that is actually shipping teaches people to
  ignore the file.
- The reporting route assumes GitHub private vulnerability reporting is
  enabled on the repo. If that is ever turned off, this file needs a real
  contact route the same day, or reports arrive as public issues.
- Do not soften the warning about executing model-authored shell commands
  while the scope, approval and timeout controls are still unwritten. It is
  the most accurate sentence in the repo.
