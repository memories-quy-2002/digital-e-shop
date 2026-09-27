import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { fingerprintFailure } from '../fingerprint-failure.mjs';

describe('failure fingerprints', () => {
  it('normalizes ANSI, workspace roots, timestamps, and timing noise', () => {
    const first = fingerprintFailure({
      commandId: 'client-typecheck',
      exitCode: 2,
      stderr: '\u001b[31mE:\\worker-128\\checkout\\digital-e-shop\\client\\src\\Card.tsx:12: error TS2322: Type mismatch at 2026-09-27T12:34:56.789Z (31ms)\u001b[0m\r\n',
    });
    const second = fingerprintFailure({
      commandId: 'client-typecheck',
      exitCode: 2,
      stderr: 'D:\\agent-7\\repo\\digital-e-shop\\client\\src\\Card.tsx:12: error TS2322: Type mismatch at 2026-09-28T03:04:05Z (240.5 ms)\n',
    });

    assert.match(first, /^[a-f0-9]{64}$/);
    assert.equal(first, second);
  });

  it('preserves materially different error codes and messages', () => {
    const typeFailure = fingerprintFailure({
      commandId: 'server-test',
      exitCode: 1,
      stderr: 'FAIL src/orders/orders.service.test.ts: expected 200, received 500',
    });
    const lintFailure = fingerprintFailure({
      commandId: 'server-test',
      exitCode: 1,
      stderr: 'FAIL src/orders/orders.service.test.ts: expected 201, received 500',
    });

    assert.notEqual(typeFailure, lintFailure);
  });

  it('includes command ID and exit code in the SHA-256 payload', () => {
    const input = { commandId: 'client-lint', exitCode: 1, stdout: 'same output' };

    assert.notEqual(
      fingerprintFailure(input),
      fingerprintFailure({ ...input, commandId: 'client-test' }),
    );
    assert.notEqual(
      fingerprintFailure(input),
      fingerprintFailure({ ...input, exitCode: 2 }),
    );
  });
});
