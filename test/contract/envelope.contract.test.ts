// Every example the protocol ships, through the protocol's own checker, from
// the relay's side. If the pinned protocol changes an example's verdict, this
// fails in the relay's CI when the pin moves — not at runtime.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createChecker, EXAMPLES_DIR, type CloseReason, type Endpoint } from '@deskaway/protocol';

interface Example {
  file: string;
  direction: 'inbound' | 'outbound';
  message?: { to: Endpoint };
  raw?: string;
  expect?: { closeReason: CloseReason };
}

const load = (kind: 'valid' | 'invalid'): Example[] =>
  readdirSync(join(EXAMPLES_DIR, kind))
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({ file: f, ...(JSON.parse(readFileSync(join(EXAMPLES_DIR, kind, f), 'utf8')) as Omit<Example, 'file'>) }));

const checker = createChecker();
const check = (ex: Example) => {
  const frame = ex.raw ?? JSON.stringify(ex.message);
  return ex.direction === 'inbound'
    ? checker.checkInbound(frame, { self: 'relay', payload: 'always' })
    : checker.checkOutbound(frame, { self: ex.message!.to, payload: 'always' });
};

const valid = load('valid');
const invalid = load('invalid');

describe('protocol examples, as the relay checks them', () => {
  it('found examples to run', () => {
    expect(valid.length).toBeGreaterThan(0);
    expect(invalid.length).toBeGreaterThan(0);
  });

  it.each(valid.map((ex) => [ex.file, ex] as const))('valid: %s passes', (_, ex) => {
    expect(check(ex)).toMatchObject({ ok: true });
  });

  it.each(invalid.map((ex) => [ex.file, ex] as const))('invalid: %s is refused with its close reason', (_, ex) => {
    expect(check(ex)).toMatchObject({ ok: false, closeReason: ex.expect!.closeReason });
  });
});
