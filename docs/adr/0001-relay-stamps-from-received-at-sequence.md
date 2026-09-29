# 0001. The relay stamps from, receivedAt and sequence, and its clock is the authority

- **Date:** 2026-09-29
- **Status:** Accepted
- **Supersedes:** none
- **Superseded by:** none

## Context

Every message carries the sender's `sentAt`, but a laptop's clock can be wrong
by minutes or years. Something has to be trusted for ordering, the 7 and 35
second liveness windows, and recordings. Separately, receivers need to know who
sent a message and where it falls in their stream, and neither of those can come
from the sender without being forgeable.

The envelope contract (`deskaway-protocol` ADR 0002) splits the envelope into
inbound and outbound, with a `relay` block that only the relay writes.

## Decision

On every message it delivers, the relay writes `relay`:

- `from` — the role of the **authenticated connection** the message arrived on.
  Never read from the message.
- `receivedAt` — the relay's own clock, in UTC. This is the authoritative time
  for everything the system decides.
- `sequence` — the next number in this session's stream to this receiver,
  starting at 1.

`sentAt` is passed through untouched as the sender's claim, and a message is
never rejected for clock skew. Messages the relay creates itself (for example
`session-evicted`, or its own heartbeats) carry `from: relay`.

## Rejected options

- **Trust `sentAt`.** One device with a bad clock would reorder or time out a
  whole session.
- **Reject messages whose `sentAt` is too far from the relay's clock.** This
  catches broken clocks, but locks out a user whose laptop clock is wrong. That
  failure is hard for them to diagnose, over something the system does not need.
- **Let the sender declare `from`.** A desktop could impersonate the phone. The
  inbound schema now forbids it outright.

## Consequences

- The relay's own clock must be right, so it needs NTP. That is one clock to
  keep right instead of every user's.
- The relay must keep a per-session, per-receiver counter that survives a
  connection dropping. From Day 44, when there are several relay tasks, that
  counter has to live in shared state, not memory.
- Anything displaying message times to a user should prefer `receivedAt`.
