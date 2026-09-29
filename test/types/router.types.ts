// Compile-time tests against the relay's own code. `npm run typecheck` fails
// if any line marked with an expect-error directive stops being an error.
// Nothing here runs.

import type { InboundMessage, OutboundMessage } from '@deskaway/protocol';
import { stamp } from '../../src/ws/router.ts';

declare const inbound: InboundMessage;

// A misspelt envelope field is not a field.
// @ts-expect-error — 'sesion' does not exist
inbound.sesion;

// The relay block does not exist until stamp() creates it.
// @ts-expect-error — an inbound message has no relay block
inbound.relay.sequence;

const out: OutboundMessage = stamp(inbound, { from: 'desktop', receivedAt: '2026-09-29T13:00:00.000Z', sequence: 1 });
out.relay.sequence;

// @ts-expect-error — 'laptop' is not an endpoint the relay can stamp
stamp(inbound, { from: 'laptop', receivedAt: '2026-09-29T13:00:00.000Z', sequence: 1 });
