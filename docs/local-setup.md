# Local setup — deskaway-relay

**No server runs yet.** What works today is the TypeScript project: the
protocol types, `src/ws/router.ts`, and its tests. The server steps further down
describe the setup as it is intended to work from Day 4; correct them in the
pull request that makes them true.

## What works today

```sh
git clone https://github.com/away-desk/deskaway-relay.git
cd deskaway-relay

nvm use          # Node 24, from .nvmrc
npm ci           # installs @deskaway/protocol from GitHub at the pinned commit
npm run typecheck
npm test
```

How to tell it is working: `typecheck` prints nothing and exits 0; `npm test`
ends with `Test Files  2 passed` and every test passing — one contract test per
protocol example, plus the router's unit tests.

`npm ci` needs network access to github.com, because `@deskaway/protocol` is a
git dependency rather than a registry package (until Day 20). It is fetched over
HTTPS; no SSH key is needed, even though `package-lock.json` records the URL as
`git+ssh`.

### Moving to a newer protocol

The protocol is pinned to one commit, in `package.json`. To move it:

```sh
npm install --save-exact "git+https://github.com/away-desk/deskaway-protocol.git#<new-commit>"
npm run typecheck && npm test
```

Do it in a pull request of its own. If the typecheck fails, a message shape the
relay relies on changed; if a contract test fails, the protocol changed what an
example means. Either is the point of pinning: you find out here, not in
production.

## What you need

- Node 24, as pinned in `.nvmrc`.
- Docker, for Postgres and Redis.

This is the heaviest component to run locally, because it is the only one with
persistent state.

## Steps

```sh
git clone https://github.com/away-desk/deskaway-relay.git
cd deskaway-relay

nvm use                  # honours .nvmrc
npm ci
```

Copy the environment template and fill it in:

```sh
cp .env.example .env
```

Every variable is declared in `src/config/schema.ts`, and boot fails loudly if
one is missing — that is intentional, so a half-configured service does not
start and then misbehave later. For local work the database and Redis URLs
should match the compose file below; most other values can stay as dummies, and
`.env.example` should say which ones cannot.

Start the dependencies:

```sh
docker compose -f docker/docker-compose.dev.yml up -d
```

That brings up Postgres and Redis. Then apply the schema and start the server:

```sh
npm run migrate
npm run dev
```

HTTP and WebSocket both listen on the same port. Check it is alive:

```sh
curl localhost:3000/health
```

Target for the whole sequence on a cold clone is under ten minutes, most of it
the Docker image pull.

## Tests

```sh
npm test                      # unit + contract (today); no Docker needed
npm run typecheck             # includes test/types: a field typo must not compile
npm run test:integration      # from Day 5; needs the compose stack running
npm run lint                  # from Day 4
```

`test/unit` must not require Docker. `test/integration`, `test/contract` and
`test/e2e` may. If a unit test starts needing a database, it belongs in a
different directory.

## Working with the other components

The relay is the hub, so most local work involves at least one other component:

- **A desktop or phone client** connects to your local relay by pointing at its
  host instead of the deployed one.
- **`deskaway-agent`** is called for planning. Run it locally too and point the
  relay's agent URL at it.
- **Message shapes** come from `deskaway-protocol`. A validation failure on a
  frame you just changed usually means the schema there needs changing first.

## When it will not start

- **Boot fails naming an environment variable** — that is `config/load.ts` doing
  its job. Add the variable to `.env`, and to `.env.example` if it is missing
  there too.
- **Cannot connect to Postgres or Redis** — check `docker compose ps`; the
  containers exit quietly if a port is already taken.
- **Migrations fail on a dirty database** — for local work, tear the volume down
  and re-migrate rather than hand-patching. Migrations are forward-only, so
  never edit one that has already run.
- **A socket connects and immediately closes** — check the heartbeat and auth
  middleware first; an unauthenticated or stale frame is closed deliberately.

Production failure modes, once this is deployed, are in
[runbook.md](./runbook.md).
