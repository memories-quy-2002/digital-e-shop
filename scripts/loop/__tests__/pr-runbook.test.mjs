import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

async function read(relativePath) {
  return readFile(path.join(repositoryRoot, relativePath), 'utf8');
}

describe('PR Babysitter rollout runbook contract', () => {
  it('defines the three stages with their exact capability boundaries', async () => {
    const [runbook, contract] = await Promise.all([
      read('docs/loop-engineering/phase-2-pr-babysitter-runbook.md'),
      read('.agent/loops/pr-babysitter.md'),
    ]);
    const source = `${runbook}\n${contract}`.replace(/\s+/g, ' ');

    for (const stage of ['Stage 0', 'Stage 1', 'Stage 2']) assert.match(source, new RegExp(stage));
    assert.match(runbook, /observe-only/i);
    assert.match(runbook, /no GitHub writes/i);
    assert.match(runbook, /no code repair/i);
    assert.match(runbook, /flaky/i);
    assert.match(runbook, /allowlist/i);
    assert.match(runbook, /secret/i);
    assert.match(runbook.replace(/\s+/g, ' '), /trusted host validates the proposed paths against canonical policy, obtains fresh path-scoped approval in a TTY, applies only validated, path-approved changes/i);
    assert.match(runbook, /does not merge/i);
    assert.match(contract, /host-injected/i);
  });

  it('sets measurable gates before each capability promotion', async () => {
    const runbook = await read('docs/loop-engineering/phase-2-pr-babysitter-runbook.md');

    const normalized = runbook.replace(/\s+/g, ' ');
    assert.match(normalized, /10 representative failed\/pending PR observations/i);
    assert.match(runbook, /0 stale-SHA actionable decisions/i);
    assert.match(normalized, /0 protected\/infrastructure cases misclassified as branch-caused/i);
    assert.match(normalized, /10 bounded rerun decisions/i);
    assert.match(runbook, /no retry-budget overruns/i);
    assert.match(runbook, /no duplicate reruns/i);
    assert.match(runbook, /human-reviewed before merge indefinitely/i);
  });

  it('documents the host-injected API without claiming a standalone CLI exists', async () => {
    const runbook = await read('docs/loop-engineering/phase-2-pr-babysitter-runbook.md');

    assert.match(runbook, /runPrBabysitterCli/);
    assert.match(runbook, /trustedHost/);
    assert.match(runbook, /no standalone CLI entrypoint/i);
    assert.match(runbook, /host bootstrap/i);
    assert.match(runbook, /Stage 0.*pending/i);
    assert.match(runbook, /No PR has been used as a Stage 0 target/i);
    assert.doesNotMatch(runbook, /node\s+scripts\/loop\/pr-babysitter-cli\.mjs/);
    assert.match(runbook, /<owner>\/\<repo>/);
    assert.match(runbook, /<pr-number>/);
  });

  it('documents credential boundaries and forbids real credentials, merge, and production authority', async () => {
    const runbook = await read('docs/loop-engineering/phase-2-pr-babysitter-runbook.md');

    for (const permission of ['metadata:read', 'pull_requests:read', 'checks:read', 'actions:read', 'administration:read']) {
      assert.ok(runbook.includes(permission), `runbook must document ${permission}`);
    }
    assert.match(runbook, /actions:write/);
    assert.match(runbook, /contents:write/);
    assert.match(runbook, /not branch-scoped/i);
    assert.match(runbook, /cannot merge/i);
    const normalized = runbook.replace(/\s+/g, ' ');
    assert.match(normalized, /checks the contents:write budget before minting the token/i);
    assert.match(normalized, /checks the budget again immediately before the push/i);
    assert.match(runbook, /production/i);
    assert.match(runbook, /pull_request_target/);
    assert.match(runbook, /raw review bodies/i);
    assert.doesNotMatch(runbook, /\bghs_[A-Za-z0-9_]{8,}\b/);
    assert.doesNotMatch(runbook, /\bgithub_pat_[A-Za-z0-9_]{8,}\b/);
    assert.doesNotMatch(runbook, /secrets\.[A-Z0-9_]+/i);
  });

  it('records Stage 0 as deferred and includes the Phase 2 telemetry and non-goals', async () => {
    const runbook = await read('docs/loop-engineering/phase-2-pr-babysitter-runbook.md');
    const normalized = runbook.replace(/\s+/g, ' ');

    assert.match(normalized, /real Stage 0.*pending/i);
    for (const metric of [
      'classification accuracy',
      'stale-evidence refusals',
      'flaky rerun success rate',
      'repair-request success rate',
      'median repair iterations',
      'CI runs per successful PR',
      'token usage per repair',
      'human intervention reasons',
    ]) assert.ok(normalized.includes(metric), `runbook must track ${metric}`);
    assert.match(normalized, /no auto-merge/i);
    assert.match(normalized, /no autonomous review-comment execution/i);
    assert.match(normalized, /no production mutation/i);
    assert.match(normalized, /no persistent Playwright E2E/i);
    assert.match(normalized, /no vendor-specific model runner/i);
  });
});
