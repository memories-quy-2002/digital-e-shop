import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';

import { createRunnerHost } from '../runner/host.mjs';

const sha = 'a'.repeat(40);
const body = 'Keep this issue text untrusted task data.';
const request = {
  schemaVersion: 1,
  task: {
    taskId: 'repo-1234-issue-42-g1', repositoryId: 1234, issueNumber: 42, generation: 1,
    requestDigest: createHash('sha256').update(body, 'utf8').digest('hex'), sourceRevision: sha, policyRevision: sha,
  },
  untrustedContext: { issueTitle: 'A bounded task', issueBody: body },
  workspace: { path: 'E:/runner/repo-1234-issue-42-g1', baseRevision: sha, allowedPaths: ['docs/API.md'] },
  limits: { wallClockSeconds: 30, maxOutputBytes: 4096, maxPatchBytes: 1024 },
  capabilities: ['read_checkout', 'write_worktree', 'run_fixed_verifier'],
};

function completedResult(overrides = {}) {
  return {
    schemaVersion: 1, taskId: request.task.taskId, status: 'completed', baseRevision: sha,
    resultRevision: 'b'.repeat(40), workspaceFingerprint: 'c'.repeat(64),
    changedPaths: ['docs/API.md'], patchBytes: 12, exitReason: null,
    ...overrides,
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function hostOptions(overrides = {}) {
  const events = [];
  return {
    events,
    options: {
      maxConcurrentTasks: 2,
      maxWallClockSeconds: 10,
      cancellationGraceMs: 50,
      reserveModelCall: async () => { events.push('reserved'); },
      startIsolatedExecution: () => {
        events.push('started');
        return { done: Promise.resolve(completedResult()), cancel: async () => { events.push('cancelled'); } };
      },
      ...overrides,
    },
  };
}

describe('provider-neutral runner host', () => {
  it('reserves model budget before starting a trusted isolated executor and validates its bounded result', async () => {
    const { events, options } = hostOptions();
    const host = createRunnerHost(options);

    const outcome = await host.run(request);

    assert.deepEqual(events, ['reserved', 'started']);
    assert.equal(outcome.status, 'completed');
    assert.deepEqual(outcome.result.changedPaths, ['docs/API.md']);
    assert.equal(Object.hasOwn(outcome, 'issueBody'), false);
  });

  it('fails closed when no isolated executor is configured', async () => {
    const { options } = hostOptions({ startIsolatedExecution: undefined });
    const host = createRunnerHost(options);

    await assert.rejects(host.run(request), { code: 'runner_isolator_unavailable' });
  });

  it('requires synchronous process-handle creation so the wall-clock limit covers startup', async () => {
    let reserved = false;
    const { options } = hostOptions({
      reserveModelCall: async () => { reserved = true; },
      startIsolatedExecution: async () => ({ done: Promise.resolve(completedResult()), cancel: async () => {} }),
    });
    const host = createRunnerHost(options);

    await assert.rejects(host.run(request), { code: 'runner_adapter_must_start_synchronously' });
    assert.equal(reserved, false);
  });

  it('cancels on timeout and does not treat a timed-out workspace as a result', async () => {
    let cancelled = false;
    const { options } = hostOptions({
      startIsolatedExecution: () => ({
        done: new Promise(() => {}),
        cancel: async (reason) => { cancelled = reason === 'runner_timeout'; },
      }),
    });
    const timeoutRequest = { ...request, limits: { ...request.limits, wallClockSeconds: 1 } };
    const host = createRunnerHost({ ...options, maxWallClockSeconds: 1, cancellationGraceMs: 50 });

    const outcome = await host.run(timeoutRequest);

    assert.equal(cancelled, true);
    assert.deepEqual(outcome, { status: 'failed', taskId: request.task.taskId, reason: 'runner_timeout' });
  });

  it('keeps a task slot occupied until interruption cancellation is confirmed', async () => {
    const started = deferred();
    const cancellation = deferred();
    const controller = new AbortController();
    const { options } = hostOptions({
      maxConcurrentTasks: 1,
      startIsolatedExecution: () => {
        started.resolve();
        return { done: new Promise(() => {}), cancel: () => cancellation.promise };
      },
    });
    const host = createRunnerHost(options);
    const run = host.run(request, { signal: controller.signal });
    await started.promise;
    controller.abort();

    await new Promise((resolve) => setImmediate(resolve));
    await assert.rejects(host.run({ ...request, task: { ...request.task, taskId: 'repo-1234-issue-43-g1', issueNumber: 43 } }), { code: 'runner_concurrency_limit' });

    cancellation.resolve();
    assert.deepEqual(await run, { status: 'interrupted', taskId: request.task.taskId, reason: 'runner_interrupted' });
  });

  it('keeps the task locked when the adapter cannot confirm cancellation', async () => {
    const started = deferred();
    const controller = new AbortController();
    const { options } = hostOptions({
      cancellationGraceMs: 10,
      startIsolatedExecution: () => {
        started.resolve();
        return { done: new Promise(() => {}), cancel: () => new Promise(() => {}) };
      },
    });
    const host = createRunnerHost(options);
    const run = host.run(request, { signal: controller.signal });
    await started.promise;
    controller.abort();

    assert.deepEqual(await run, {
      status: 'failed', taskId: request.task.taskId, reason: 'runner_cancellation_unconfirmed',
    });
    assert.equal(host.activeCount, 1);
    await assert.rejects(host.run(request), { code: 'runner_task_already_active' });
  });

  it('rejects duplicate active task IDs even when capacity remains', async () => {
    const execution = deferred();
    const started = deferred();
    const { options } = hostOptions({
      startIsolatedExecution: () => { started.resolve(); return { done: execution.promise, cancel: async () => {} }; },
    });
    const host = createRunnerHost(options);
    const run = host.run(request);
    await started.promise;

    await assert.rejects(host.run(request), { code: 'runner_task_already_active' });
    execution.resolve(completedResult());
    assert.equal((await run).status, 'completed');
  });

  it('rejects concurrent work once the configured capacity is occupied', async () => {
    const executions = [];
    const started = deferred();
    const { options } = hostOptions({
      maxConcurrentTasks: 1,
      startIsolatedExecution: (input) => {
        const completion = deferred();
        executions.push({ input, completion });
        if (executions.length === 1) started.resolve();
        return { done: completion.promise, cancel: async () => {} };
      },
    });
    const host = createRunnerHost(options);
    const run = host.run(request);
    await started.promise;
    const nextRequest = {
      ...request,
      task: { ...request.task, taskId: 'repo-1234-issue-43-g1', issueNumber: 43 },
    };

    await assert.rejects(host.run(nextRequest), { code: 'runner_concurrency_limit' });
    executions[0].completion.resolve(completedResult());
    await run;
    assert.equal(executions.length, 1);
  });

  it('does not start execution when the model budget reservation fails', async () => {
    let started = false;
    const { options } = hostOptions({
      reserveModelCall: async () => { throw new Error('private billing detail'); },
      startIsolatedExecution: () => { started = true; throw new Error('must not start'); },
    });
    const host = createRunnerHost(options);

    assert.deepEqual(await host.run(request), {
      status: 'failed', taskId: request.task.taskId, reason: 'budget_reservation_failed',
    });
    assert.equal(started, false);
  });

  it('reduces an executor crash to bounded failure evidence without returning the error text', async () => {
    const { options } = hostOptions({
      startIsolatedExecution: () => ({
        done: Promise.reject(new Error('host credential leaked in process output')),
        cancel: async () => {},
      }),
    });
    const host = createRunnerHost(options);

    const outcome = await host.run(request);

    assert.deepEqual(outcome, {
      status: 'failed', taskId: request.task.taskId, reason: 'runner_process_failed',
    });
    assert.equal(JSON.stringify(outcome).includes('credential'), false);
  });

  it('converts invalid or out-of-scope executor output to bounded protocol failure evidence', async () => {
    const { options } = hostOptions({
      startIsolatedExecution: () => ({
        done: Promise.resolve(completedResult({ changedPaths: ['.agent/policy/autonomy.yml'] })),
        cancel: async () => {},
      }),
    });
    const host = createRunnerHost(options);

    assert.deepEqual(await host.run(request), {
      status: 'failed', taskId: request.task.taskId, reason: 'runner_result_invalid',
    });
  });
});
