# deskaway-relay

The cloud broker that connects a phone to a desktop: it terminates both
WebSocket connections, owns pairing and session claims, and records runs.

It sits in the middle of the system — `deskaway-android` and
`deskaway-desktop` both connect here, and it is the only component holding
persistent state (Postgres, Redis, S3).

## Status

**Early development. No server yet.**

The module layout is settled and most files are still empty placeholders:
there is no server to boot, no route that responds, and no migrations. What
exists is the TypeScript project and its link to the wire contract —
`@deskaway/protocol`'s generated types and checker, the router's `stamp()`, and
tests that run every protocol example through the relay's side.

## Running locally

What runs today:

```sh
git clone https://github.com/away-desk/deskaway-relay.git
cd deskaway-relay
nvm use && npm ci
npm run typecheck && npm test
```

The server itself arrives on Day 4. The intended path once it exists:

```sh
git clone https://github.com/away-desk/deskaway-relay.git
cd deskaway-relay

nvm use                                  # honours .nvmrc
npm ci

cp .env.example .env                     # then fill in the blanks

docker compose -f docker/docker-compose.dev.yml up -d   # postgres + redis
npm run migrate
npm run dev                              # http + ws on localhost
```

Target is under ten minutes on a cold clone, with the Docker image pull
being most of it. `docs/local-setup.md` has the detail, including how to move
the pinned protocol commit forward.

## The rest of DeskAway

Cross-repo docs and architecture decisions live in
**[deskaway-docs](https://github.com/away-desk/deskaway-docs)**. All
components are under the **[away-desk](https://github.com/away-desk)** org.

The wire protocol this service speaks is defined in
[deskaway-protocol](https://github.com/away-desk/deskaway-protocol).
Contributor guidance, including the rule for maintaining this README, is in
[AGENT.md](./AGENT.md).
