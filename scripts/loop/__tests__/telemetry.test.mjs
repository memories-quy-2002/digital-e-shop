import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { appendTelemetryEvent, summarizePrTelemetry } from '../telemetry.mjs';

const roots = new Set();

async function createRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'digital-e-pr-telemetry-'));
  roots.add(root);
  return root;
}

function event(overrides = {}) {
  return {
    timestamp: '2026-09-28T03:04:05.000Z',
    repository: 'Owner/Repo',
    prNumber: 42,
    headSha: 'a'.repeat(40),
    action: 'request-repair',
    reasonCode: 'relevant_check_failed',
    failureCategory: 'branch-caused',
    checkIds: ['check-unit-1'],
    retryCount: 0,
    repairRequestCount: 1,
    elapsedMs: 1200,
    humanIntervention: false,
    ...overrides,
  };
}

afterEach(async () => {
  for (const root of roots) await rm(root, { recursive: true, force: true });
  roots.clear();
});

describe('PR Babysitter telemetry', () => {
  it('appends exact bounded metadata as JSONL and never accepts prompt or log fields', async () => {
    const root = await createRoot();
    const firstEvent = await appendTelemetryEvent(root, event());
    await appendTelemetryEvent(root, event({ action: 'ready-for-human', repairRequestCount: 1 }));

    const file = path.join(root, '.loop', 'telemetry', 'pr-babysitter.jsonl');
    const lines = (await readFile(file, 'utf8')).trimEnd().split(/\r?\n/);
    assert.equal(lines.length, 2);
    assert.deepEqual(JSON.parse(lines[0]), firstEvent);
    await assert.rejects(appendTelemetryEvent(root, event({ prompt: 'private task text' })), /unsupported/i);
    await assert.rejects(appendTelemetryEvent(root, event({ rawLogs: 'secret output' })), /unsupported/i);
  });

  it('validates canonical IDs, bounded counters, and optional host token totals', async () => {
    const root = await createRoot();
    await appendTelemetryEvent(root, event({ tokenInput: 120, tokenOutput: 80 }));

    await assert.rejects(appendTelemetryEvent(root, event({ reasonCode: 'repair the code now' })), /reasonCode/i);
    await assert.rejects(appendTelemetryEvent(root, event({ tokenInput: 1 })), /token/i);
    await assert.rejects(appendTelemetryEvent(root, event({ elapsedMs: -1 })), /elapsedMs/i);
  });

  it('summarizes observations, retries, repairs, escalation categories, median attempts, and interventions', () => {
    const events = [
      event({ action: 'retry-check', failureCategory: 'flaky', retryCount: 1, repairRequestCount: 0 }),
      event({ repository: 'Owner/Repo', prNumber: 42, headSha: 'b'.repeat(40), action: 'request-repair', repairRequestCount: 2 }),
      event({ repository: 'Other/Repo', prNumber: 9, headSha: 'c'.repeat(40), action: 'request-repair', repairRequestCount: 2 }),
      event({ repository: 'Other/Repo', prNumber: 9, headSha: 'c'.repeat(40), action: 'ready-for-human', repairRequestCount: 2 }),
      event({ repository: 'Third/Repo', prNumber: 12, headSha: 'd'.repeat(40), action: 'request-repair', repairRequestCount: 4 }),
      event({ repository: 'Third/Repo', prNumber: 12, headSha: 'd'.repeat(40), action: 'ready-for-human', repairRequestCount: 4, humanIntervention: true, humanReasonCode: 'manual_review' }),
      event({ action: 'escalate', failureCategory: 'infrastructure', repairRequestCount: 0, humanIntervention: true, humanReasonCode: 'manual_review' }),
      event({ action: 'escalate', failureCategory: 'protected', repairRequestCount: 0 }),
    ];

    assert.deepEqual(summarizePrTelemetry(events), {
      observationCount: 8,
      flakyRetries: 1,
      repairRequests: 3,
      escalationsByCategory: { infrastructure: 1, protected: 1 },
      medianRepairAttemptsBeforeGreen: 3,
      humanInterventionRate: 2 / 8,
    });
  });

  it('returns stable empty metrics for an empty event list', () => {
    assert.deepEqual(summarizePrTelemetry([]), {
      observationCount: 0,
      flakyRetries: 0,
      repairRequests: 0,
      escalationsByCategory: {},
      medianRepairAttemptsBeforeGreen: null,
      humanInterventionRate: 0,
    });
  });
});
