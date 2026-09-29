# 0003. Resume by sequence, dedupe by envelope id

- **Date:** 2026-09-29
- **Status:** Accepted
- **Supersedes:** none
- **Superseded by:** none

## Context

A phone loses the network, and a laptop sleeps. After a reconnect, the device
must get what it missed without losing or duplicating anything. That is two
separate jobs: finding the gap, and recognising a message already handled when
it arrives again. Duplicates cannot be ruled out, because a device can handle a
message and crash before it records that it did.

## Decision

- **Resume** uses `relay.sequence`. A reconnecting device sends the highest
  sequence it saw in `hello.lastSeenSequence`, and the relay resends every
  message after it in that session's stream. It resends the same frames, with
  the same `id` and `sequence`. There is no separate resume message.
- **Dedupe** uses the envelope `id`. A resent message keeps its id, and every
  receiver drops an id it has already handled.

## Rejected options

- **A separate resume message after hello.** Two round trips before work can
  continue, when the device sends `hello` anyway.
- **Dedupe by sequence alone.** A sequence is per stream, while the id is
  global and survives being moved between streams or stored in a recording.
- **Dedupe by a payload idempotency key only.** The relay and generic receivers
  would have to open payloads. The command-level idempotency key (Day 21)
  exists to decide whether *executing* twice is safe, which is a different
  question.

## Consequences

- The relay must retain each stream long enough to serve a resume. How long,
  and where it lives once the relay runs as several tasks, is settled with the
  Redis bus (Day 44).
- Receivers must keep a set of handled ids at least as long as the relay
  retains streams.
- A `lastSeenSequence` beyond what the relay holds is a bug on one side. The
  handling for that case is designed on Day 9.
