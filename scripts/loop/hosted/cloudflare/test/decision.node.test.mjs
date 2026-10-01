import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { decidePrAction } from '../../../pr-babysitter.mjs';
import { decisionFixtures } from './decision-fixtures.mjs';

describe('portable Stage 0 decision fixtures in Node', () => {
  for (const fixture of decisionFixtures) {
    it(`matches the expected result for a ${fixture.name}`, () => {
      const decision = decidePrAction(fixture.input);

      assert.deepEqual(
        { action: decision.action, reasonCode: decision.reasonCode },
        fixture.expected,
      );
    });
  }
});
