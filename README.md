# deskaway-relay

The cloud broker that connects a phone to a desktop: it terminates both
WebSocket connections, owns pairing and session claims, and records runs.

It sits in the middle of the system — `deskaway-android` and
`deskaway-desktop` both connect here, and it is the only component holding
persistent state (Postgres, Redis, S3).

## Status

**Early development, nothing works yet.**

The module layout is settled and every file is in place, but they are all
empty — there is no server to boot, no route that responds, and
`package.json` has no dependencies or scripts in it yet. There are no
migrations, so there is no schema either.

## Running locally

Not yet possible: `package.json` is an empty file, so there is nothing to
install and nothing to start.

The dependencies it will need are already declared in the repo — pinned Node
in `.nvmrc`, and Postgres plus Redis in `docker/docker-compose.dev.yml`. The
intended path, once the manifest and entrypoint exist:

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
being most of it. `docs/local-setup.md` will carry the detail, including
which `.env` values can stay as dummies — it is currently empty.

## The rest of DeskAway

Cross-repo docs and architecture decisions live in
**[deskaway-docs](https://github.com/away-desk/deskaway-docs)**. All
components are under the **[away-desk](https://github.com/away-desk)** org.

The wire protocol this service speaks is defined in
[deskaway-protocol](https://github.com/away-desk/deskaway-protocol).
Contributor guidance, including the rule for maintaining this README, is in
[AGENT.md](./AGENT.md).
