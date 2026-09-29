# 0004. Consume the protocol as a pinned git dependency, through its own checker

- **Date:** 2026-09-29
- **Status:** Accepted
- **Supersedes:** none
- **Superseded by:** none

## Context

The relay needs the message types at compile time and the check order at
runtime (ADR 0002). `deskaway-protocol` now ships both as `@deskaway/protocol`
(its ADR 0008), but nothing is published to a registry until Day 20 (its ADR
0010). The relay has to get the package somehow, and has to decide how a
protocol change reaches it.

## Decision

- Depend on `@deskaway/protocol` as a git dependency **pinned to a commit**, in
  `package.json`. Moving to a newer protocol is its own pull request, checked
  by `typecheck` and the contract tests.
- Validate every frame through the package's `createChecker()`. The relay does
  not load schemas or configure Ajv itself, so its check order cannot drift from
  the protocol's.
- `stamp()` in `src/ws/router.ts` is the only place a relay block is created.
  Its signature — `InboundMessage` in, `OutboundMessage` out — is the relay's
  contract in the type system: an inbound message has no `relay` field, so the
  compiler rejects reading one.
- `test/contract/` runs every example the pinned protocol ships through that
  checker; `test/types/` holds cases that must fail to compile.

## Rejected options

- **Track the protocol's `main`.** A protocol change could break the relay's CI
  with no change to the relay, and two builds of the same relay commit could
  differ.
- **Copy the schemas in and validate with our own Ajv setup.** A second check
  order that would drift from the first — the exact problem the package exists
  to prevent.
- **Wait for the published package.** Day 4 onwards needs the types now.

## Consequences

- A protocol change reaches the relay only when the pin moves, and the relay's
  CI decides whether it can.
- `npm ci` needs github.com, over HTTPS. `package-lock.json` records the URL as
  `git+ssh`; npm still fetches a public GitHub dependency as an HTTPS tarball, so
  no SSH key is needed (checked with SSH disabled).
- TypeScript is structural: an outbound message still fits where an inbound one
  is expected, so the types do not stop `stamp(stamp(msg))`. The runtime checker
  refuses a relay block on any inbound frame, which is where that must be caught.
- Day 20 swaps the git URL for a registry version; the imports do not change.
