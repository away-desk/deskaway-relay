# 0002. An invalid message closes the connection, with a reason

- **Date:** 2026-09-29
- **Status:** Accepted
- **Supersedes:** none
- **Superseded by:** none

## Context

The relay will receive messages it cannot accept: frames that are too large,
not JSON, have an unknown `type`, have a newer envelope version, carry a forged
relay block, or break the schema. Each of these means the sender is broken,
outdated or hostile. The relay is the only always-on component and has to
assume every inbound frame is hostile.

## Decision

Any message that fails a check closes the connection with a code from
`deskaway-protocol/enums/close-reason.json`. Checks run in the order defined in
`deskaway-protocol/docs/wire-format.md`, and the first failure names the reason:

1. size → `message-too-large`
2. parse → `invalid-json`
3. `envelopeVersion` → `unsupported-envelope-version`
4. relay block on inbound → `relay-fields-from-sender`
5. `type` → `unknown-type`
6. envelope schema → `invalid-envelope`
7. payload schema, only when `to` is `relay` → `invalid-payload`

A `hello` whose `role` or `deviceId` does not match the authenticated
connection closes with `device-mismatch`. The reference implementation is
`deskaway-protocol/scripts/check-message.mjs`, and every file in
`deskaway-protocol/examples/invalid/` must produce its stated reason.

## Rejected options

- **Forward messages of an unknown type and let the receiver decide.** This
  keeps the relay dumber, but lets junk travel end to end and puts validation
  in two places.
- **Drop the message and send an error frame, keeping the connection open.** A
  sender producing invalid messages is not in a state worth trusting with the
  next one. An error frame protocol is also a second message family to design
  and version.
- **Silently drop.** Nobody finds out why nothing works.

## Consequences

- A new message type has to reach the relay (a protocol upgrade) before any
  client may send it, or clients are disconnected. Rollouts go relay first.
- Close reasons appear in logs and metrics, so a spike in `unknown-type` or
  `unsupported-envelope-version` signals a version skew.
- Clients must treat a close with one of these reasons as a bug to report, not
  as a network drop to retry forever.
