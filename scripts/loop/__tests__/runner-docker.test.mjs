import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

import { loadLoopPolicy } from '../policy.mjs';
import { createDockerRunnerAdapter, createPolicyPatchAuthorizer } from '../runner/docker-adapter.mjs';

const sha = 'a'.repeat(40);
const body = 'A small, untrusted task request.';
const workspaceRoots = new Set();
let loopPolicy;
before(async () => { loopPolicy = await loadLoopPolicy(); });
afterEach(() => {
  for (const root of workspaceRoots) rmSync(root, { recursive: true, force: true });
  workspaceRoots.clear();
});
function makeWorkspace() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'docker-runner-test-'));
  workspaceRoots.add(root);
  return root;
}
const request = {
  schemaVersion: 1,
  task: {
    taskId: 'repo-1234-issue-42-g1', repositoryId: 1234, issueNumber: 42, generation: 1,
    requestDigest: createHash('sha256').update(body).digest('hex'), sourceRevision: sha, policyRevision: sha,
  },
  untrustedContext: { issueTitle: 'Task', issueBody: body },
  workspace: { path: '', baseRevision: sha, allowedPaths: ['docs/API.md'] },
  limits: { wallClockSeconds: 30, maxOutputBytes: 4096, maxPatchBytes: 1024 },
  capabilities: ['read_checkout', 'write_worktree', 'run_fixed_verifier'],
};

function completedResult() {
  return {
    schemaVersion: 1, taskId: request.task.taskId, status: 'completed', baseRevision: sha,
    resultRevision: 'b'.repeat(40), workspaceFingerprint: 'c'.repeat(64),
    changedPaths: ['docs/API.md'], patchBytes: 83, exitReason: null,
  };
}

function fakeChild() {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.stdin = new PassThrough();
  child.kill = () => { child.emit('close', 137, null); return true; };
  child.stdin.resume();
  return child;
}

function options(overrides = {}) {
  const launched = [];
  const events = [];
  return {
    launched,
    events,
    config: {
      dockerPath: 'docker',
      imageDigest: `example.invalid/loop-runner@sha256:${'d'.repeat(64)}`,
      modelName: 'GPT-6-Luna',
      maxContainerMemoryBytes: 512 * 1024 * 1024,
      maxContainerCpuCount: 1,
      maxContainerPids: 64,
      maxModelCalls: 3,
      reserveModelCall: async () => { events.push('reserved'); },
      invokeModelCall: async ({ model, instructions, input }) => {
        events.push('model');
        assert.equal(model, 'gpt-6-luna');
        assert.match(instructions, /untrusted/i);
        return { output: `model reply: ${input}` };
      },
      authorizePatch: ({ paths }) => paths.join(',') === 'docs/API.md',
      spawnImpl: (...args) => {
        const child = fakeChild();
        child.spawnOptions = args[2];
        launched.push({ args, child });
        let stdinBuffer = '';
        child.stdin.on('data', (chunk) => {
          stdinBuffer += chunk.toString();
          let newline;
          while ((newline = stdinBuffer.indexOf('\n')) >= 0) {
            const line = stdinBuffer.slice(0, newline);
            stdinBuffer = stdinBuffer.slice(newline + 1);
            if (!line) continue;
            const inputFrame = JSON.parse(line);
            if (inputFrame.type !== 'model_result') continue;
            events.push(inputFrame.type);
            const patch = 'diff --git a/docs/API.md b/docs/API.md\nindex 1111111..2222222 100644\n--- a/docs/API.md\n+++ b/docs/API.md\n@@ -1 +1 @@\n-old\n+new\n';
            const result = { ...completedResult(), patchBytes: Buffer.byteLength(patch) };
            child.stdout.write(`${JSON.stringify({ type: 'runner_result', result, patch })}\n`);
            child.emit('close', 0, null);
          }
        });
        setImmediate(() => {
          const call = { type: 'model_call', operationId: 'op-1', input: 'inspect docs/API.md' };
          child.stdout.write(`${JSON.stringify(call)}\n`);
        });
        return child;
      },
      ...overrides,
    },
  };
}

describe('Docker isolated runner adapter', () => {
  it('uses a no-network, read-only-source container and brokers each model call on the host', async () => {
    const { config, launched, events } = options();
    const adapter = createDockerRunnerAdapter(config);
    const execution = adapter.startIsolatedExecution({ ...request, workspace: { ...request.workspace, path: makeWorkspace() } });
    const outcome = await execution.done;

    const { args: spawnArgs, child } = launched[0];
    const [, args, spawnOptions] = spawnArgs;
    assert.equal(args[0], 'run');
    assert.ok(args.includes('--network') && args[args.indexOf('--network') + 1] === 'none');
    assert.ok(args.includes('--read-only'));
    assert.ok(args.includes('--cap-drop') && args[args.indexOf('--cap-drop') + 1] === 'ALL');
    assert.ok(args.includes('--pull=never'));
    assert.ok(args.some((argument) => argument.includes('target=/source,readonly')));
    assert.ok(!args.some((argument) => /OPENAI_API_KEY|GITHUB_TOKEN|.ssh/i.test(argument)));
    assert.equal(Object.hasOwn(spawnOptions.env, 'OPENAI_API_KEY'), false);
    assert.deepEqual(events, ['reserved', 'model', 'model_result']);
    assert.equal(outcome.status, 'completed');
    assert.match(outcome.patch, /^diff --git a\/docs\/API\.md b\/docs\/API\.md/m);
  });

  it('rejects a patch outside the allowed path set before returning it to the host', async () => {
    const { config } = options({
      spawnImpl: (...args) => {
        const child = fakeChild();
        setImmediate(() => {
          const patch = 'diff --git a/.agent/policy/autonomy.yml b/.agent/policy/autonomy.yml\n';
          const result = { ...completedResult(), changedPaths: ['.agent/policy/autonomy.yml'], patchBytes: Buffer.byteLength(patch) };
          child.stdout.write(`${JSON.stringify({ type: 'runner_result', result, patch })}\n`);
          child.emit('close', 0, null);
        });
        return child;
      },
    });
    const adapter = createDockerRunnerAdapter(config);
    const execution = adapter.startIsolatedExecution({ ...request, workspace: { ...request.workspace, path: makeWorkspace() } });

    await assert.rejects(execution.done, { code: 'runner_result_out_of_scope' });
  });

  it('reserves before each brokered call and refuses calls after the configured model budget', async () => {
    const { config, events } = options({
      maxModelCalls: 1,
      spawnImpl: (...args) => {
        const child = fakeChild();
        let calls = 0;
        let stdinBuffer = '';
        child.stdin.on('data', (chunk) => {
          stdinBuffer += chunk.toString();
          let newline;
          while ((newline = stdinBuffer.indexOf('\n')) >= 0) {
            const line = stdinBuffer.slice(0, newline);
            stdinBuffer = stdinBuffer.slice(newline + 1);
            if (!line) continue;
            const inputFrame = JSON.parse(line);
            if (inputFrame.type === 'model_result' && calls === 0) {
              calls += 1;
              child.stdout.write(`${JSON.stringify({ type: 'model_call', operationId: 'op-2', input: 'second call' })}\n`);
            } else if (inputFrame.type === 'model_error') {
              child.emit('close', 0, null);
            }
          }
        });
        setImmediate(() => {
          child.stdout.write(`${JSON.stringify({ type: 'model_call', operationId: 'op-1', input: 'hello' })}\n`);
        });
        return child;
      },
    });
    const adapter = createDockerRunnerAdapter(config);
    const execution = adapter.startIsolatedExecution({ ...request, workspace: { ...request.workspace, path: makeWorkspace() } });

    await assert.rejects(execution.done, { code: 'runner_model_budget_exhausted' });
    assert.equal(events.filter((event) => event === 'reserved').length, 1);
  });

  it('uses the coordinator reservation for the first call and reserves every later operation itself', async () => {
    const { config, events } = options();
    const adapter = createDockerRunnerAdapter(config);
    const execution = adapter.startIsolatedExecution(
      { ...request, workspace: { ...request.workspace, path: makeWorkspace() } },
      { preReservedModelCalls: 1 },
    );

    await execution.done;

    assert.deepEqual(events, ['model', 'model_result']);
  });

  it('refuses mutable image tags and an absent patch authorization gate', () => {
    const { config } = options();
    assert.throws(() => createDockerRunnerAdapter({ ...config, imageDigest: 'example.invalid/runner:latest' }), { code: 'runner_adapter_configuration_invalid' });
    assert.throws(() => createDockerRunnerAdapter({ ...config, modelName: 'GPT-6-Sol' }), { code: 'runner_model_invalid' });
    assert.throws(() => createDockerRunnerAdapter({ ...config, authorizePatch: undefined }), { code: 'runner_adapter_configuration_invalid' });
  });

  it('confirms cancellation through the Docker supervisor before releasing the task slot', async () => {
    const invocations = [];
    const { config } = options({
      spawnImpl: (executable, args, spawnOptions) => {
        invocations.push({ executable, args, spawnOptions });
        const child = fakeChild();
        if (args[0] === 'rm') setImmediate(() => child.emit('close', 0, null));
        return child;
      },
    });
    const adapter = createDockerRunnerAdapter(config);
    const execution = adapter.startIsolatedExecution({ ...request, workspace: { ...request.workspace, path: makeWorkspace() } });

    await execution.cancel('runner_interrupted');

    assert.deepEqual(invocations[1].args.slice(0, 2), ['rm', '-f']);
    assert.equal(adapter.activeCount, 0);
    await assert.rejects(execution.done, { code: 'runner_interrupted' });
  });

  it('stops and rejects an executor that exceeds the combined stdout limit', async () => {
    let child;
    const { config } = options({
      spawnImpl: () => {
        child = fakeChild();
        const originalKill = child.kill;
        let killed = false;
        child.kill = () => { killed = true; return originalKill(); };
        setImmediate(() => child.stdout.write('x'.repeat(request.limits.maxOutputBytes + 1)));
        child.wasKilled = () => killed;
        return child;
      },
    });
    const adapter = createDockerRunnerAdapter(config);
    const execution = adapter.startIsolatedExecution({ ...request, workspace: { ...request.workspace, path: makeWorkspace() } });

    await assert.rejects(execution.done, { code: 'runner_output_limit_exceeded' });
    assert.equal(child.wasKilled(), true);
  });

  it('classifies exact eligible patch paths and refuses high-risk or critical policy paths', () => {
    const authorizePatch = createPolicyPatchAuthorizer(loopPolicy, {
      enabled: true,
      autoMergeEnabled: false,
      eligiblePaths: ['docs/API.md', 'client/src/features/products/pages/ProductPage.tsx', '.agent/policy/autonomy.yml'],
      eligibleRisks: ['low', 'medium'],
    });
    assert.equal(authorizePatch({ paths: ['docs/API.md'] }), true);
    assert.equal(authorizePatch({ paths: ['client/src/features/products/pages/ProductPage.tsx'] }), true);
    assert.equal(authorizePatch({ paths: ['.agent/policy/autonomy.yml'] }), false);
    assert.equal(authorizePatch({ paths: ['docs/API.md', 'outside.md'] }), false);
  });
});
