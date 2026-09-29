// Routing on the envelope alone. The relay never opens a payload it forwards;
// everything here reads only envelope fields, and the types enforce which ones
// exist: an inbound message has no `relay` field at all.

import type { InboundMessage, OutboundMessage, RelayBlock } from '@deskaway/protocol';

/**
 * The stream a message belongs to: one per session and receiving endpoint.
 * `relay.sequence` counts within it, and resume replays from it
 * (docs/adr/0003-resume-by-sequence-dedupe-by-id.md).
 */
export function streamKey(msg: InboundMessage): string {
  return `${msg.session ?? 'no-session'}:${msg.to}`;
}

/**
 * Turns a message a device sent into the message the relay delivers. This is
 * the only place a relay block is created. `stamp.from` must come from the
 * authenticated connection the frame arrived on, and `receivedAt` from the
 * relay's own clock — never from the message
 * (docs/adr/0001-relay-stamps-from-received-at-sequence.md).
 */
export function stamp(msg: InboundMessage, relay: RelayBlock): OutboundMessage {
  return { ...msg, relay: { from: relay.from, receivedAt: relay.receivedAt, sequence: relay.sequence } };
}
