import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { parsePrBabysitterArguments, runPrBabysitterCli, PR_BABYSITTER_EXIT_CODES } from './pr-babysitter-cli.mjs';
import { createPrBabysitterStage0Host, STAGE0_REPOSITORY } from './pr-babysitter-host.mjs';
import { createGitHubWorkflowSourceAttestationProvider } from './github-workflow-source-attestation.mjs';
import { createWorkflowSourceVerifier } from './workflow-source-attestation.mjs';

export const STAGE1_TRUST_STATUS = Object.freeze({
  sourceAttestationProvider: 'configured',
  workflowAllowlistEntries: 0,
  trustedApproverIds: 0,
  ciRunBudgetSession: 'unavailable',
});

const STAGE1_BLOCKERS = Object.freeze([
  'workflow_source_sha_unattested',
  'ci_run_budget_session_unavailable',
  'stage1_trust_configuration_unavailable',
  'stage1_dispatch_runtime_unavailable',
  'trusted_job_graph_unavailable',
  'stage1_host_observer_unavailable',
]);

export function assertStage1Command(args, isTTY) {
  if (!args || !['inspect', 'rerun-flaky'].includes(args.command)) {
    throw Object.assign(new Error('stage1_command_refused'), { code: 'stage1_command_refused' });
  }
  if (args.repository !== STAGE0_REPOSITORY) {
    throw Object.assign(new Error('repository_not_allowlisted'), { code: 'repository_not_allowlisted' });
  }
  if (args.command === 'rerun-flaky' && isTTY !== true && args.dryRun !== true) {
    throw Object.assign(new Error('interactive_tty_required'), { code: 'interactive_tty_required' });
  }
  return true;
}

// Stage 1 inspection reuses the independently tested read-only bootstrap. It has no
// write adapter; retry remains refused unless a separate host-owned approval,
// budget, workflow identity, and observer runtime is configured and reviewed.
export async function createPrBabysitterStage1Host({ prNumber, repoRoot = process.cwd(), env = process.env } = {}) {
  return createPrBabysitterStage0Host({
    prNumber,
    repoRoot,
    env,
    createWorkflowSourceVerifier: ({ getObserveToken }) => createStage1WorkflowSourceVerifier({ getObserveToken }),
  });
}

export function createStage1WorkflowSourceVerifier({
  getObserveToken,
  providerFactory = createGitHubWorkflowSourceAttestationProvider,
} = {}) {
  if (typeof getObserveToken !== 'function' || typeof providerFactory !== 'function') {
    throw Object.assign(new Error('stage1_source_attestation_configuration_invalid'), {
      reasonCode: 'stage1_source_attestation_configuration_invalid',
    });
  }
  const provider = providerFactory({
    repository: STAGE0_REPOSITORY,
    getToken: async (capability) => {
      if (capability !== 'observe') {
        throw Object.assign(new Error('stage1_read_only'), { reasonCode: 'stage1_read_only' });
      }
      return getObserveToken('source-attestation:read');
    },
  });
  return createWorkflowSourceVerifier({
    repository: STAGE0_REPOSITORY,
    inspectAttestation: provider.inspectWorkflowSourceAttestation,
  });
}

function writeJson(stream, value) {
  stream.write(`${JSON.stringify(value)}\n`);
}

function reasonCodeFor(error, fallback) {
  return /^[a-z][a-z0-9_]{0,79}$/.test(error?.reasonCode ?? '')
    ? error.reasonCode
    : /^[a-z][a-z0-9_]{0,79}$/.test(error?.code ?? '') ? error.code : fallback;
}

export async function runPrBabysitterStage1({
  argv = process.argv.slice(2),
  repoRoot = process.cwd(),
  env = process.env,
  io = {},
} = {}) {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  let args;
  try {
    args = parsePrBabysitterArguments(argv);
    assertStage1Command(args, io.isTTY ?? process.stdin.isTTY === true);
  } catch (error) {
    const reasonCode = reasonCodeFor(error, 'invalid_arguments');
    writeJson(stderr, { status: 'refused', reasonCode });
    return { exitCode: PR_BABYSITTER_EXIT_CODES.refused, reasonCode };
  }

  if (args.dryRun) {
    return runPrBabysitterCli({ argv, trustedHost: null, io: { ...io, stdout, stderr } });
  }

  if (args.command === 'rerun-flaky') {
    writeJson(stderr, { status: 'refused', reasonCode: 'stage1_prerequisites_unavailable', blockers: STAGE1_BLOCKERS });
    return {
      exitCode: PR_BABYSITTER_EXIT_CODES.refused,
      reasonCode: 'stage1_prerequisites_unavailable',
      blockers: STAGE1_BLOCKERS,
    };
  }

  try {
    const trustedHost = await createPrBabysitterStage1Host({ prNumber: args.prNumber, repoRoot, env });
    return await runPrBabysitterCli({ argv, trustedHost, io: { ...io, stdout, stderr } });
  } catch (error) {
    const reasonCode = reasonCodeFor(error, 'stage1_observation_failed');
    const exitCode = Number.isInteger(error?.exitCode) ? error.exitCode : PR_BABYSITTER_EXIT_CODES.infrastructure;
    writeJson(stderr, { status: exitCode === PR_BABYSITTER_EXIT_CODES.infrastructure ? 'error' : 'refused', reasonCode });
    return { exitCode, reasonCode };
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  const result = await runPrBabysitterStage1({
    argv: process.argv.slice(2),
    repoRoot: process.cwd(),
    env: process.env,
    io: { stdout: process.stdout, stderr: process.stderr, isTTY: process.stdin.isTTY === true },
  });
  process.exitCode = result.exitCode;
}
