import { describe, expect, it } from 'vitest';
import { createChecker, type InboundMessage } from '@deskaway/protocol';
import { stamp, streamKey } from '../../src/ws/router.ts';

const hello: InboundMessage<'hello'> = {
  id: '6f1c2b9e-3d4a-4c8e-9b21-7a5d0e4f8c13',
  type: 'hello',
  envelopeVersion: 1,
  to: 'relay',
  runId: '00000000-0000-0000-0000-000000000000',
  traceId: '0a9f3e7c-6b2d-4c1a-9e8f-5d3b1a7c4e20',
  sentAt: '2025-01-01T00:00:00.000Z',
  payload: { role: 'phone', deviceId: '8d3a6c2e-5f1b-4a97-b0e4-c2f8a1d6e953', deviceName: 'Pixel', os: 'Android 16', appVersion: '0.1.0' },
};

describe('stamp', () => {
  const out = stamp(hello, { from: 'phone', receivedAt: '2026-09-29T13:00:00.412Z', sequence: 7 });

  it('adds the relay block it is given and changes nothing else', () => {
    expect(out.relay).toEqual({ from: 'phone', receivedAt: '2026-09-29T13:00:00.412Z', sequence: 7 });
    const { relay: _, ...rest } = out;
    expect(rest).toEqual(hello);
  });

  it("passes the sender's sentAt through untouched, even when its clock is wrong", () => {
    expect(out.sentAt).toBe('2025-01-01T00:00:00.000Z');
  });

  it('produces a message the protocol accepts as outbound', () => {
    const result = createChecker().checkOutbound(JSON.stringify({ ...out, to: 'desktop' }), { self: 'desktop', payload: 'always' });
    expect(result).toMatchObject({ ok: true });
  });

  it('does not mutate the inbound message', () => {
    expect('relay' in hello).toBe(false);
  });
});

describe('streamKey', () => {
  it('is per session and receiver', () => {
    expect(streamKey({ ...hello, session: 'c4e9a1f7-2b6d-4f3e-8a5c-9d1b7e0f2a68', to: 'desktop' })).toBe(
      'c4e9a1f7-2b6d-4f3e-8a5c-9d1b7e0f2a68:desktop',
    );
    expect(streamKey(hello)).toBe('no-session:relay');
  });
});
