import { validateRunnerRequest, validateRunnerResult } from './protocol.mjs';

const OPTION_KEYS = [
  'maxConcurrentTasks', 'maxWallClockSeconds', 'cancellationGraceMs',
  'reserveModelCall', 'startIsolatedExecution',
];

export class RunnerHostError extends Error {
  constructor(code) {
    super(code);
    this.name = new.target.name;
    this.code = code;
  }
}

function fail(code) { throw new RunnerHostError(code); }

function isThenable(value) {
  return value !== null && (typeof value === 'object' || typeof value === 'function')
    && typeof value.then === 'function';
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a trusted host coordinator. startIsolatedExecution must be provided by
 * an operator-owned sandbox adapter that cannot read host files or credentials.
 * This module deliberately ships no same-host Codex executor.
 */
export function createRunnerHost(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options)
      || Object.keys(options).sort().join('|') !== [...OPTION_KEYS].sort().join('|')
      || !Number.isSafeInteger(options.maxConcurrentTasks) || options.maxConcurrentTasks < 1 || options.maxConcurrentTasks > 32
      || !Number.isFinite(options.maxWallClockSeconds) || options.maxWallClockSeconds < 1 || options.maxWallClockSeconds > 24 * 60 * 60
      || !Number.isSafeInteger(options.cancellationGraceMs) || options.cancellationGraceMs < 1 || options.cancellationGraceMs > 30_000
      || typeof options.reserveModelCall !== 'function'
      || (options.startIsolatedExecution !== undefined && typeof options.startIsolatedExecution !== 'function')) {
    fail('runner_host_configuration_invalid');
  }

  // A task remains in this map when the adapter cannot confirm cancellation.
  // Keeping its slot occupied prevents overlapping writers in an unknown state.
  const active = new Map();

  async function run(input, runOptions = {}) {
    const request = validateRunnerRequest(input);
    if (!runOptions || typeof runOptions !== 'object' || Array.isArray(runOptions)
        || Object.keys(runOptions).some((key) => key !== 'signal')
        || (runOptions.signal !== undefined && typeof runOptions.signal?.addEventListener !== 'function')) {
      fail('runner_host_options_invalid');
    }
    const signal = runOptions.signal;
    const taskId = request.task.taskId;
    if (signal?.aborted) return Object.freeze({ status: 'interrupted', taskId, reason: 'runner_interrupted' });
    if (active.has(taskId)) fail('runner_task_already_active');
    if (active.size >= options.maxConcurrentTasks) fail('runner_concurrency_limit');
    if (typeof options.startIsolatedExecution !== 'function') fail('runner_isolator_unavailable');
    if (options.startIsolatedExecution.constructor?.name === 'AsyncFunction') fail('runner_adapter_must_start_synchronously');

    const activeToken = Object.freeze({});
    active.set(taskId, activeToken);
    let releasable = true;
    try {
      try {
        await options.reserveModelCall(Object.freeze({
          taskId,
          repositoryId: request.task.repositoryId,
          issueNumber: request.task.issueNumber,
          generation: request.task.generation,
          requestDigest: request.task.requestDigest,
          sourceRevision: request.task.sourceRevision,
          policyRevision: request.task.policyRevision,
        }));
      } catch {
        return Object.freeze({ status: 'failed', taskId, reason: 'budget_reservation_failed' });
      }

      if (signal?.aborted) return Object.freeze({ status: 'interrupted', taskId, reason: 'runner_interrupted' });

      let execution;
      try {
        execution = options.startIsolatedExecution(request, Object.freeze({ preReservedModelCalls: 1 }));
      } catch {
        return Object.freeze({ status: 'failed', taskId, reason: 'runner_start_failed' });
      }
      if (isThenable(execution)) {
        releasable = false;
        Promise.resolve(execution).then(async (lateExecution) => {
          if (!lateExecution || typeof lateExecution.cancel !== 'function') return;
          try {
            const confirmed = await Promise.race([
              Promise.resolve().then(() => lateExecution.cancel('runner_adapter_invalid')).then(() => true, () => false),
              delay(options.cancellationGraceMs).then(() => false),
            ]);
            if (confirmed && active.get(taskId) === activeToken) active.delete(taskId);
          } catch { /* Keep the slot locked when adapter shutdown is uncertain. */ }
        }).catch(() => {});
        return Object.freeze({ status: 'failed', taskId, reason: 'runner_adapter_invalid' });
      }
      if (!execution || typeof execution !== 'object' || !isThenable(execution.done) || typeof execution.cancel !== 'function') {
        releasable = false;
        return Object.freeze({ status: 'failed', taskId, reason: 'runner_adapter_invalid' });
      }

      const timeoutMs = Math.ceil(Math.min(request.limits.wallClockSeconds, options.maxWallClockSeconds) * 1000);
      let stop;
      const stopSignal = new Promise((resolve) => { stop = resolve; });
      const onAbort = () => stop('runner_interrupted');
      signal?.addEventListener('abort', onAbort, { once: true });
      const timer = setTimeout(() => stop('runner_timeout'), timeoutMs);
      if (signal?.aborted) onAbort();
      const completion = Promise.resolve(execution.done).then(
        (result) => ({ kind: 'completed', result }),
        () => ({ kind: 'failed' }),
      );
      const settled = await Promise.race([completion, stopSignal.then((reason) => ({ kind: 'stopped', reason }))]);
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);

      if (settled.kind === 'completed') {
        try {
          return Object.freeze({ status: 'completed', result: validateRunnerResult(settled.result, request) });
        } catch {
          return Object.freeze({ status: 'failed', taskId, reason: 'runner_result_invalid' });
        }
      }
      if (settled.kind === 'failed') return Object.freeze({ status: 'failed', taskId, reason: 'runner_process_failed' });

      let cancellationConfirmed = false;
      try {
        cancellationConfirmed = await Promise.race([
          Promise.resolve().then(() => execution.cancel(settled.reason)).then(() => true, () => false),
          delay(options.cancellationGraceMs).then(() => false),
        ]);
      } catch {
        cancellationConfirmed = false;
      }
      if (!cancellationConfirmed) {
        releasable = false;
        return Object.freeze({ status: 'failed', taskId, reason: 'runner_cancellation_unconfirmed' });
      }
      return Object.freeze({
        status: settled.reason === 'runner_timeout' ? 'failed' : 'interrupted',
        taskId,
        reason: settled.reason,
      });
    } finally {
      if (releasable && active.get(taskId) === activeToken) active.delete(taskId);
    }
  }

  return Object.freeze({ run, get activeCount() { return active.size; } });
}
