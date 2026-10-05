import { describe, expect, it, vi } from 'vitest';

import { createGitHubReportClient } from '../src/github/report-client';

const appId = 5130911;
const repositoryId = 123456;
const repository = 'memories-quy-2002/digital-e-shop';
const baseSha = 'a'.repeat(40);
const headSha = 'b'.repeat(40);
const mergeSha = 'c'.repeat(40);
const policyFingerprint = '1'.repeat(64);
const reportName = 'Loop Engineering Stage 0';

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    repository,
    number: 264,
    state: 'open' as const,
    draft: false,
    baseRef: 'main',
    baseSha,
    headRef: 'feature/stage0',
    headSha,
    mergeSha,
    headRepository: repository,
    updatedAt: '2026-10-01T00:00:00.000Z',
    repositoryId,
    baseRepositoryId: repositoryId,
    headRepositoryId: repositoryId,
    defaultBranch: 'main',
    ...overrides,
  };
}

function requiredPolicy(overrides: Record<string, unknown> = {}) {
  return {
    baseRef: 'main',
    policyFingerprint,
    requiredChecks: [{ context: 'client', appId: 15368 }],
    requiredCheckKeys: ['client|app:15368'],
    requiredWorkflows: [],
    requiredWorkflowKeys: [],
    collectionStatus: 'complete' as const,
    ...overrides,
  };
}

function responseRun(id: number, sha = headSha) {
  return Response.json({
    id,
    name: reportName,
    head_sha: sha,
    app: { id: appId },
  });
}

function reportFixture(options: {
  enforceWorkerRedirect?: boolean;
  lookup?: Response;
  write?: Response;
  refresh?: () => Promise<{ snapshot: ReturnType<typeof snapshot>; requiredCheckSnapshot: ReturnType<typeof requiredPolicy> }>;
} = {}) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (options.enforceWorkerRedirect && init?.redirect === 'error') {
      throw new TypeError('Invalid redirect value, must be one of "follow" or "manual"');
    }
    calls.push({ url: String(input), init });
    if (init?.method === 'GET') return options.lookup ?? Response.json({ total_count: 0, check_runs: [] });
    return options.write ?? responseRun(9001);
  });
  const auth = { getInstallationToken: vi.fn(async (capability: string) => {
    expect(capability).toBe('report');
    return 'ghs_report_token';
  }) };
  const client = createGitHubReportClient({
    configuration: {
      appId,
      installationId: 166381027,
      repositoryId,
      repository,
      privateKey: 'unused',
      checkRunName: reportName,
    },
    auth,
    fetchImpl,
    now: () => Date.UTC(2026, 9, 1, 0, 30, 0),
  });
  const input = {
    snapshot: snapshot(),
    decision: {
      action: 'wait',
      reasonCode: 'required_check_evidence_missing',
      headSha,
      baseSha,
      mergeSha,
      requiredCheckPolicyFingerprint: policyFingerprint,
    },
    requiredCheckSnapshot: requiredPolicy(),
    existingCheckRunId: null,
    refresh: options.refresh ?? vi.fn(async () => ({
      snapshot: snapshot(),
      requiredCheckSnapshot: requiredPolicy(),
    })),
  };
  return { client, input, calls, fetchImpl, auth };
}

describe('report-only GitHub Check Run publisher', () => {
  it('publishes using a Worker-supported redirect mode', async () => {
    const { client, input, calls } = reportFixture({ enforceWorkerRedirect: true });

    await expect(client.publish(input)).resolves.toEqual({ checkRunId: 9001 });
    expect(calls.map(({ init }) => init?.redirect)).toEqual(['manual', 'manual']);
  });

  it('creates a bounded neutral report on the exact current head and has no generic write method', async () => {
    const { client, input, calls } = reportFixture();

    const published = await client.publish(input);

    expect(published).toEqual({ checkRunId: 9001 });
    expect(Object.keys(client)).toEqual(['publish']);
    expect(calls.map(({ init }) => init?.method)).toEqual(['GET', 'POST']);
    expect(new Headers(calls[0]?.init?.headers).get('user-agent')).toBe('Digital-E-Loop-Stage0');
    expect(new Headers(calls[1]?.init?.headers).get('user-agent')).toBe('Digital-E-Loop-Stage0');
    expect(calls[0]?.url).toContain('/commits/' + headSha + '/check-runs?');
    expect(calls[0]?.url).toContain('check_name=Loop+Engineering+Stage+0');
    expect(calls[0]?.url).toContain('app_id=' + appId);
    expect(calls[1]?.url).toBe('https://api.github.com/repos/memories-quy-2002/digital-e-shop/check-runs');
    const body = JSON.parse(String(calls[1]?.init?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      name: reportName,
      head_sha: headSha,
      status: 'completed',
      conclusion: 'neutral',
      started_at: '2026-10-01T00:30:00.000Z',
      completed_at: '2026-10-01T00:30:00.000Z',
    });
    const summary = (body.output as Record<string, unknown>).summary as string;
    expect(summary).toContain('Observed at: 2026-10-01T00:30:00.000Z');
    expect(summary).toContain('does not grant merge readiness');
    expect(summary.length).toBeLessThan(1024);
    expect(JSON.stringify(body)).not.toContain('ghs_report_token');
    expect(JSON.stringify(body)).not.toContain('review body');
  });

  it('updates the existing app-owned report and recovers its ID from the lookup', async () => {
    const { client, input, calls } = reportFixture({
      lookup: Response.json({
        total_count: 1,
        check_runs: [{ id: 9002, name: reportName, head_sha: headSha, app: { id: appId } }],
      }),
      write: responseRun(9002),
    });

    const published = await client.publish({ ...input, existingCheckRunId: null });

    expect(published).toEqual({ checkRunId: 9002 });
    expect(calls.map(({ init }) => init?.method)).toEqual(['GET', 'PATCH']);
    expect(calls[1]?.url).toBe('https://api.github.com/repos/memories-quy-2002/digital-e-shop/check-runs/9002');
    expect(String(calls[1]?.init?.body)).not.toContain('head_sha');
  });

  it('refuses publication if policy is incomplete or the report name is required', async () => {
    const incomplete = reportFixture({
      refresh: async () => ({
        snapshot: snapshot(),
        requiredCheckSnapshot: requiredPolicy({ collectionStatus: 'unavailable' }),
      }),
    });
    await expect(incomplete.client.publish(incomplete.input)).rejects.toMatchObject({
      code: 'policy_incomplete',
    });
    expect(incomplete.calls).toEqual([]);

    const required = reportFixture({
      refresh: async () => ({
        snapshot: snapshot(),
        requiredCheckSnapshot: requiredPolicy({
          requiredChecks: [{ context: reportName, appId }],
          requiredCheckKeys: [reportName + '|app:' + appId],
        }),
      }),
    });
    await expect(required.client.publish(required.input)).rejects.toMatchObject({
      code: 'report_check_is_required',
    });
    expect(required.calls).toEqual([]);
  });

  it('refuses a stale tuple immediately before writing', async () => {
    let refreshCount = 0;
    const fixture = reportFixture({
      refresh: async () => {
        refreshCount += 1;
        return {
          snapshot: snapshot(refreshCount === 1 ? {} : { headSha: 'd'.repeat(40) }),
          requiredCheckSnapshot: requiredPolicy(),
        };
      },
    });

    await expect(fixture.client.publish(fixture.input)).rejects.toMatchObject({
      code: 'stale_pr_tuple',
    });
    expect(fixture.calls).toHaveLength(1);
    expect(fixture.calls[0]?.init?.method).toBe('GET');
  });

  it('refuses a pagination link that leaves the GitHub API origin', async () => {
    const fixture = reportFixture({
      lookup: new Response(JSON.stringify({ total_count: 1, check_runs: [] }), {
        headers: {
          link: '<https://attacker.example/check-runs?page=2&per_page=100>; rel="next"',
        },
      }),
    });

    await expect(fixture.client.publish(fixture.input)).rejects.toMatchObject({
      code: 'lookup_incomplete',
    });
    expect(fixture.calls).toHaveLength(1);
  });

  it('refuses ambiguous or foreign Check Run lookup results without writing', async () => {
    const ambiguous = reportFixture({
      lookup: Response.json({
        total_count: 2,
        check_runs: [
          { id: 9003, name: reportName, head_sha: headSha, app: { id: appId } },
          { id: 9004, name: reportName, head_sha: headSha, app: { id: appId } },
        ],
      }),
    });
    await expect(ambiguous.client.publish(ambiguous.input)).rejects.toMatchObject({ code: 'lookup_ambiguous' });
    expect(ambiguous.calls).toHaveLength(1);

    const foreign = reportFixture({
      lookup: Response.json({
        total_count: 1,
        check_runs: [{ id: 9005, name: reportName, head_sha: headSha, app: { id: appId + 1 } }],
      }),
    });
    const published = await foreign.client.publish(foreign.input);
    expect(published).toEqual({ checkRunId: 9001 });
    expect(foreign.calls.map(({ init }) => init?.method)).toEqual(['GET', 'POST']);
  });
});
