import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const workflowPath = '.github/workflows/loop-foundation.yml';
const sourceShaProbeWorkflowPath = '.github/workflows/loop-source-sha-probe.yml';
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
  'scripts/loop/__tests__/pr-runbook.test.mjs',
  'scripts/loop/__tests__/telemetry.test.mjs',
  'scripts/loop/__tests__/pr-contracts.test.mjs',
  'scripts/loop/__tests__/github-pr-client.test.mjs',
  'scripts/loop/__tests__/github-auth-provider.test.mjs',
  'scripts/loop/__tests__/github-actions-write.test.mjs',
  'scripts/loop/__tests__/pr-worktree-guard.test.mjs',
  'scripts/loop/__tests__/repair-session.test.mjs',
  'scripts/loop/__tests__/verify.test.mjs',
  'scripts/loop/__tests__/workflow.test.mjs',
  'scripts/loop/__tests__/workflow-source-descriptor.test.mjs',
  'scripts/loop/__tests__/workflow-source-attestation.test.mjs',
  'scripts/loop/__tests__/stage1-target.test.mjs',
  'scripts/loop/__tests__/stage1-source-sha-probe.test.mjs',
  'scripts/loop/__tests__/stage1-prompt.test.mjs',
  'scripts/loop/__tests__/pr-babysitter-stage1-host.test.mjs',
];
const reviewedActions = [
  'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
  'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020',
];
const attestAction = 'actions/attest@1e69f48acb82d1966a394da916b4c1698aa569d6';

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

function jobBlock(source, jobName) {
  const start = source.search(new RegExp(`^  ${jobName}:\\s*$`, 'm'));
  if (start < 0) return '';
  const remainder = source.slice(start);
  const nextJob = remainder.slice(1).search(/^  [A-Za-z0-9_-]+:\s*$/m);
  return nextJob < 0 ? remainder : remainder.slice(0, nextJob + 1);
}

function jobPermissionLines(block) {
  const match = block.match(/^    permissions:\r?\n((?:      [^\r\n]+\r?\n?)+)/m);
  return match ? match[1].trimEnd().split(/\r?\n/).map((line) => line.trim()) : [];
}

describe('Loop Foundation workflow contract', () => {
  it('runs only for pull requests to main and pushes to main', async () => {
    const workflow = await read(workflowPath);
    assert.deepEqual(triggerBlockLines(workflow), [
      '  pull_request:',
      '    branches:',
      '      - main',
      '    types: [opened, reopened, synchronize, labeled]',
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
    const testJob = jobBlock(workflow, 'test');
    const attestationJob = jobBlock(workflow, 'attest-workflow-source');
    const actionRefs = (block) => [...block.matchAll(/^\s*uses:\s*([^\s#]+)/gm)].map((match) => match[1]);
    assert.deepEqual(actionRefs(testJob), reviewedActions);
    assert.deepEqual(actionRefs(attestationJob), [reviewedActions[1], attestAction]);
    assert.equal(actionRefs(workflow).length, 4);
    for (const actionRef of [...actionRefs(testJob), ...actionRefs(attestationJob)]) {
      assert.match(actionRef, /^[-A-Za-z0-9_.]+\/[-A-Za-z0-9_.]+@[a-f0-9]{40}$/);
    }
    assert.match(workflow, /^          persist-credentials: false$/m);
    assert.doesNotMatch(attestationJob, /actions\/checkout@/);
  });

  it('uses the repository Node version file and keeps the default token permission read-only', async () => {
    const [workflow, nodeVersion] = await Promise.all([read(workflowPath), read('.node-version')]);
    assert.equal(nodeVersion.trim(), '24.20.0');
    assert.match(workflow, /^permissions:\r?\n  contents: read\s*$/m);
    assert.match(workflow, /^          node-version-file: \.node-version$/m);
    assert.deepEqual(jobPermissionLines(jobBlock(workflow, 'test')), []);
  });

  it('attests only labeled same-repository pilot runs after test', async () => {
    const workflow = await read(workflowPath);
    const job = jobBlock(workflow, 'attest-workflow-source');
    assert.notEqual(job, '');
    assert.match(job, /^    needs: test$/m);
    assert.match(job, /always\(\)/);
    assert.match(job, /github\.event_name == 'pull_request'/);
    assert.match(job, /github\.event\.pull_request\.head\.repo\.full_name == github\.repository/);
    assert.match(job, /github\.event\.label\.name == 'loop-stage1-attestation-pilot'/);
    assert.match(job, /github\.event\.pull_request\.state == 'open'/);
    assert.match(job, /subject-name: digital-e-loop-workflow-source\.json/);
    assert.match(job, /subject-digest: sha256:\$\{\{ steps\.descriptor\.outputs\.sha256 \}\}/);
    assert.match(job, /digital-e-loop-workflow-source\.json/);
    assert.match(job, /`\/repos\/\$\{repository\}\/actions\/runs\/\$\{runId\}`/);
    assert.match(job, /GITHUB_EVENT_PATH/);
    assert.match(job, /GITHUB_RUN_ATTEMPT/);
    assert.match(job, /GITHUB_REPOSITORY_ID/);
    assert.match(job, /head\.sha/);
    assert.match(job, /merge_commit_sha/);
    assert.doesNotMatch(job, /scripts\/loop\//);
  });

  it('grants OIDC and attestation write permissions only to the pinned no-checkout producer job', async () => {
    const workflow = await read(workflowPath);
    const job = jobBlock(workflow, 'attest-workflow-source');
    assert.deepEqual(jobPermissionLines(job), [
      'actions: read',
      'contents: read',
      'id-token: write',
      'attestations: write',
    ]);
    assert.match(job, new RegExp(`uses: ${attestAction.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    assert.match(job, /actions\/setup-node@820762786026740c76f36085b0efc47a31fe5020/);
    assert.match(job, /node-version: 24\.20\.0/);
    assert.equal([...workflow.matchAll(/^\s*id-token:\s*write\s*$/gm)].length, 1);
    assert.equal([...workflow.matchAll(/^\s*attestations:\s*write\s*$/gm)].length, 1);
    assert.doesNotMatch(workflow, /^\s*(?:actions|contents|artifact-metadata):\s*write\s*$/m);
    assert.doesNotMatch(job, /(?:actions|contents|pull-requests|issues|artifact-metadata):\s*write/);
    assert.doesNotMatch(job, /\bsecrets\./i);
    assert.doesNotMatch(job, /github\.workflow_sha|sourceSha|source_sha/);
    assert.match(job, /GITHUB_OUTPUT/);
  });

  it('runs the fixed control-plane Node test list, Stage 1 suites, and three static routing smokes only', async () => {
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
    const testJob = jobBlock(workflow, 'test');
    const attestationJob = jobBlock(workflow, 'attest-workflow-source');
    assert.doesNotMatch(workflow, /\bsecrets\./i);
    assert.doesNotMatch(workflow, /\b(?:pnpm|npm|yarn)\s+(?:install|ci|add)\b/i);
    assert.doesNotMatch(testJob, /(?:actions|contents|pull-requests|issues|id-token|attestations):\s*write/i);
    assert.doesNotMatch(attestationJob, /(?:actions|contents|pull-requests|issues|artifact-metadata):\s*write/i);
    assert.doesNotMatch(workflow, /pull_request_target|environment:\s*production|git\s+push|\bgh\s+(?:issue|pr)\s+(?:create|edit|comment|merge)/i);
    assert.doesNotMatch(workflow, /prisma:migrate|test:integration|seed:mock|vercel\s+--prod/i);
  });
});

describe('read-only Loop source SHA probe workflow contract', () => {
  it('runs only after the named workflow completes with read-only permissions', async () => {
    const workflow = await read(sourceShaProbeWorkflowPath);
    assert.match(workflow, /^name: Loop source SHA probe$/m);
    assert.match(workflow, /\bon:\r?\n  workflow_run:\r?\n    workflows: \["Loop Foundation"\]\r?\n    types: \[completed\]/);
    assert.match(workflow, /^permissions:\r?\n  actions: read\r?\n  contents: read$/m);
    assert.match(workflow, /^      actions: read\r?\n      contents: read$/m);
    assert.match(workflow, /^    if: github\.repository == 'memories-quy-2002\/digital-e-shop'$/m);
  });

  it('uses pinned trusted-source actions and invokes only the bounded local CLI', async () => {
    const workflow = await read(sourceShaProbeWorkflowPath);
    const actionRefs = [...workflow.matchAll(/^\s*uses:\s*([^\s#]+)/gm)].map((match) => match[1]);
    assert.deepEqual(actionRefs, reviewedActions);
    assert.match(workflow, /^          ref: \$\{\{ github\.sha \}\}$/m);
    assert.match(workflow, /^          persist-credentials: false$/m);
    assert.match(workflow, /^          node-version-file: \.node-version$/m);
    assert.match(workflow, /^        run: node scripts\/loop\/stage1-source-sha-probe-cli\.mjs$/m);
    assert.doesNotMatch(workflow, /(?:contents|actions|id-token|attestations):\s*write/i);
    assert.doesNotMatch(workflow, /download-artifact|actions\/attest|pull_request_target|checkout.*head_sha/i);
  });
});
