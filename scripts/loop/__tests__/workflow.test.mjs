import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const workflowPath = '.github/workflows/loop-foundation.yml';
const controlPlaneTests = [
  'scripts/loop/__tests__/policy.test.mjs',
  'scripts/loop/__tests__/classify-risk.test.mjs',
  'scripts/loop/__tests__/fingerprint-failure.test.mjs',
  'scripts/loop/__tests__/state.test.mjs',
  'scripts/loop/__tests__/classify-failure.test.mjs',
  'scripts/loop/__tests__/controller.test.mjs',
  'scripts/loop/__tests__/contracts.test.mjs',
  'scripts/loop/__tests__/pr-evidence.test.mjs',
  'scripts/loop/__tests__/pr-state.test.mjs',
  'scripts/loop/__tests__/pr-babysitter.test.mjs',
  'scripts/loop/__tests__/pr-babysitter-cli.test.mjs',
  'scripts/loop/__tests__/pr-packets.test.mjs',
  'scripts/loop/__tests__/telemetry.test.mjs',
  'scripts/loop/__tests__/pr-contracts.test.mjs',
  'scripts/loop/__tests__/github-pr-client.test.mjs',
  'scripts/loop/__tests__/github-auth-provider.test.mjs',
  'scripts/loop/__tests__/github-actions-write.test.mjs',
  'scripts/loop/__tests__/pr-worktree-guard.test.mjs',
  'scripts/loop/__tests__/repair-session.test.mjs',
  'scripts/loop/__tests__/verify.test.mjs',
  'scripts/loop/__tests__/workflow.test.mjs',
];
const reviewedActions = [
  'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
  'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020',
];

async function read(relativePath) {
  return readFile(path.join(repositoryRoot, relativePath), 'utf8');
}

function triggerBlockLines(source) {
  const lines = source.split(/\r?\n/);
  const start = lines.findIndex((line) => line === 'on:');
  assert.notEqual(start, -1, 'workflow must declare top-level triggers');
  const block = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() === '') continue;
    if (!/^\s/.test(line)) break;
    block.push(line.trimEnd());
  }
  return block;
}

describe('read-only Loop Foundation workflow contract', () => {
  it('runs only for pull requests to main and pushes to main', async () => {
    const workflow = await read(workflowPath);
    assert.deepEqual(triggerBlockLines(workflow), [
      '  pull_request:',
      '    branches:',
      '      - main',
      '  push:',
      '    branches:',
      '      - main',
    ]);
    assert.doesNotMatch(workflow, /^\s*pull_request_target:/m);
    assert.match(workflow, /^    runs-on: ubuntu-24\.04$/m);
    assert.match(workflow, /^name: Loop Foundation$/m);
    assert.match(workflow, /^    name: test$/m);
  });

  it('pins only the reviewed checkout/setup-node actions and disables checkout credentials', async () => {
    const workflow = await read(workflowPath);
    const actionRefs = [...workflow.matchAll(/^\s*uses:\s*([^\s#]+)/gm)].map((match) => match[1]);
    assert.deepEqual(actionRefs, reviewedActions);
    for (const actionRef of actionRefs) {
      assert.match(actionRef, /^[-A-Za-z0-9_.]+\/[-A-Za-z0-9_.]+@[a-f0-9]{40}$/);
    }
    assert.match(workflow, /^          persist-credentials: false$/m);
  });

  it('uses the repository Node version file with read-only token permissions', async () => {
    const [workflow, nodeVersion] = await Promise.all([read(workflowPath), read('.node-version')]);
    assert.equal(nodeVersion.trim(), '24.20.0');
    assert.match(workflow, /^permissions:\r?\n  contents: read\s*$/m);
    assert.match(workflow, /^          node-version-file: \.node-version$/m);
    assert.doesNotMatch(workflow, /^\s+(?:contents|pull-requests|issues|id-token):\s*write\s*$/m);
  });

  it('runs the fixed control-plane Node test list and three static routing smokes only', async () => {
    const workflow = await read(workflowPath);
    const testStart = workflow.indexOf('node --test');
    const smokeStepStart = workflow.indexOf('      - name: Smoke test verification routing', testStart);
    const testCommand = testStart >= 0 && smokeStepStart > testStart
      ? workflow.slice(testStart, smokeStepStart)
      : '';
    const actualTestPaths = [...testCommand.matchAll(/scripts\/loop\/__tests__\/[A-Za-z0-9.-]+\.test\.mjs/g)]
      .map(([testPath]) => testPath);
    assert.deepEqual(actualTestPaths, controlPlaneTests, 'workflow must run the exact fixed control-plane test list');
    const smokeCommands = workflow.split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith('node scripts/loop/verify.mjs --dry-run'));
    assert.deepEqual(smokeCommands, [
      'node scripts/loop/verify.mjs --dry-run --mode fast --changed client/src/App.tsx',
      'node scripts/loop/verify.mjs --dry-run --mode fast --changed server/src/catalog/catalog.service.ts',
      'node scripts/loop/verify.mjs --dry-run --mode fast --changed .github/workflows/loop-foundation.yml',
    ]);
  });

  it('contains no credentials, dependency installation, write actions, or production operations', async () => {
    const workflow = await read(workflowPath);
    assert.doesNotMatch(workflow, /\bsecrets\./i);
    assert.doesNotMatch(workflow, /\b(?:pnpm|npm|yarn)\s+(?:install|ci|add)\b/i);
    assert.doesNotMatch(workflow, /(?:contents|pull-requests|issues|id-token):\s*write/i);
    assert.doesNotMatch(workflow, /pull_request_target|environment:\s*production|git\s+push|\bgh\s+(?:issue|pr)\s+(?:create|edit|comment|merge)/i);
    assert.doesNotMatch(workflow, /prisma:migrate|test:integration|seed:mock|vercel\s+--prod/i);
  });
});
