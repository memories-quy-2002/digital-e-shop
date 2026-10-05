import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { it } from 'node:test';

import { createStage1Prompt } from '../stage1-prompt.mjs';

const now = Date.parse('2026-10-05T12:00:00.000Z');
const sha = (letter) => letter.repeat(40);

function approvalPayload(overrides = {}) {
  const actionTarget = {
    workflowId: 5001,
    runId: 7001,
    runAttempt: 2,
    failedJobIds: [9001],
    requiredIdentity: {
      type: 'workflow',
      repositoryId: 987654,
      path: '.github/workflows/loop-foundation.yml',
      ref: 'refs/heads/main',
      sha: sha('a'),
    },
  };
  return {
    type: 'approval',
    repositoryId: 987654,
    repository: 'memories-quy-2002/digital-e-shop',
    prNumber: 42,
    revision: { baseSha: sha('b'), headSha: sha('c'), mergeSha: sha('d') },
    capability: 'actions:rerun',
    paths: ['.github/workflows/loop-foundation.yml'],
    testedSha: sha('d'),
    actionTarget,
    approverId: 1001,
    expiresAt: new Date(now + 60_000).toISOString(),
    ...overrides,
  };
}

function reviewContext(payload = approvalPayload(), overrides = {}) {
  return {
    repositoryId: payload.repositoryId,
    prNumber: payload.prNumber,
    revision: payload.revision,
    capability: payload.capability,
    paths: payload.paths,
    testedSha: payload.testedSha,
    actionTarget: payload.actionTarget,
    branch: 'feature/approved-pilot',
    classification: 'flaky',
    remainingCIRuns: 2,
    remainingFlakyRetries: 1,
    jobGraph: [
      { name: 'test', status: 'completed', conclusion: 'failure', needs: [] },
      { name: 'report', status: 'completed', conclusion: 'skipped', needs: ['test'] },
    ],
    ...overrides,
  };
}

function createTty() {
  const input = new PassThrough();
  const output = new PassThrough();
  input.isTTY = true;
  output.isTTY = true;
  let text = '';
  output.on('data', (chunk) => { text += chunk.toString(); });
  return {
    input,
    output,
    text: () => text,
    close() {
      input.destroy();
      output.destroy();
    },
  };
}

async function answerPrompt(prompt, streams, payload, answer) {
  const pending = prompt(payload);
  setImmediate(() => streams.input.write(answer + '\n'));
  return pending;
}

it('never asks for approval or reads review context unless both streams are TTYs', async () => {
  for (const [inputIsTTY, outputIsTTY] of [[false, false], [false, true], [true, false]]) {
    let touched = false;
    const streams = {
      input: { isTTY: inputIsTTY },
      output: { isTTY: outputIsTTY, write() { touched = true; } },
    };
    const prompt = createStage1Prompt({
      ...streams,
      now: () => now,
      getReviewContext: async () => { touched = true; },
    });

    assert.equal(prompt.isTTY, false);
    assert.equal(await prompt(approvalPayload()), false);
    assert.equal(touched, false);
  }
});

it('rejects unknown prompt payloads without opening the terminal or reading context', async () => {
  const streams = createTty();
  let touched = false;
  const prompt = createStage1Prompt({
    ...streams,
    now: () => now,
    getReviewContext: async () => { touched = true; },
  });

  try {
    assert.equal(await prompt({ type: 'unexpected' }), false);
    assert.equal(touched, false);
    assert.equal(streams.text(), '');
  } finally {
    streams.close();
  }
});

it('treats Enter as cancellation for a rerun approval', async () => {
  const streams = createTty();
  const payload = approvalPayload();
  const prompt = createStage1Prompt({
    ...streams,
    now: () => now,
    getReviewContext: async () => reviewContext(payload),
  });

  try {
    assert.equal(await answerPrompt(prompt, streams, payload, ''), false);
    assert.match(streams.text(), /Rerun failed jobs and their dependent jobs\? Type RERUN:/);
    assert.match(streams.text(), /"remainingCIRuns":\s*2/);
  } finally {
    streams.close();
  }
});

it('requires the exact RERUN confirmation and prints only bounded review metadata', async () => {
  const streams = createTty();
  const payload = approvalPayload();
  const prompt = createStage1Prompt({
    ...streams,
    now: () => now,
    getReviewContext: async () => reviewContext(payload),
  });

  try {
    assert.equal(await answerPrompt(prompt, streams, payload, 'RERUN'), true);
    assert.match(streams.text(), /feature\/approved-pilot/);
    assert.match(streams.text(), /"runId":\s*7001/);
    assert.doesNotMatch(streams.text(), /rawLog|authorization|secret|token/i);
  } finally {
    streams.close();
  }
});

it('cancels on a non-exact response and refuses an expired approval before reading context', async () => {
  const streams = createTty();
  let touched = false;
  const expired = approvalPayload({ expiresAt: new Date(now).toISOString() });
  const prompt = createStage1Prompt({
    ...streams,
    now: () => now,
    getReviewContext: async () => { touched = true; return reviewContext(expired); },
  });

  try {
    assert.equal(await prompt(expired), false);
    assert.equal(touched, false);
    assert.equal(streams.text(), '');
  } finally {
    streams.close();
  }

  const cancelStreams = createTty();
  const payload = approvalPayload();
  const cancelPrompt = createStage1Prompt({
    ...cancelStreams,
    now: () => now,
    getReviewContext: async () => reviewContext(payload),
  });
  try {
    assert.equal(await answerPrompt(cancelPrompt, cancelStreams, payload, 'CANCEL'), false);
  } finally {
    cancelStreams.close();
  }
});

it('refuses a mismatched review target or exhausted/non-flaky review context', async () => {
  const payload = approvalPayload();
  for (const context of [
    reviewContext(payload, { prNumber: 43 }),
    reviewContext(payload, { classification: 'code-caused' }),
    reviewContext(payload, { remainingCIRuns: 0 }),
    reviewContext(payload, { remainingFlakyRetries: 0 }),
    reviewContext(payload, { jobGraph: [{ name: 'test', status: 'completed', conclusion: 'failure', needs: [], log: 'unbounded raw log' }] }),
  ]) {
    const streams = createTty();
    const prompt = createStage1Prompt({
      ...streams,
      now: () => now,
      getReviewContext: async () => context,
    });
    try {
      assert.equal(await prompt(payload), false);
      assert.equal(streams.text(), '');
    } finally {
      streams.close();
    }
  }
});

it('requires explicit CONTINUE for device authentication and rejects expired codes', async () => {
  const streams = createTty();
  const payload = {
    type: 'device-code',
    verificationUri: 'https://github.com/login/device',
    userCode: 'ABCD-EFGH',
    expiresAt: new Date(now + 60_000).toISOString(),
  };
  const prompt = createStage1Prompt({ ...streams, now: () => now, getReviewContext: async () => null });

  try {
    assert.equal(await answerPrompt(prompt, streams, payload, 'CONTINUE'), true);
    assert.match(streams.text(), /https:\/\/github\.com\/login\/device/);
    assert.match(streams.text(), /ABCD-EFGH/);
    assert.equal(await prompt({ ...payload, expiresAt: new Date(now).toISOString() }), false);
  } finally {
    streams.close();
  }
});
