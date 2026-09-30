import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

async function read(relativePath) {
  return readFile(path.join(repositoryRoot, relativePath), 'utf8');
}

function section(markdown, heading) {
  const lines = markdown.split(/\r?\n/);
  const selected = [];
  let found = false;
  for (const line of lines) {
    if (!found && line === `## ${heading}`) {
      found = true;
      continue;
    }
    if (found && /^##\s+/.test(line)) break;
    if (found) selected.push(line);
  }
  return found ? selected.join('\n') : '';
}

describe('Phase 2 PR babysitter contracts', () => {
  it('defines exact actions and binds all evidence to the current head/base/merge tuple', async () => {
    const guide = await read('.agent/loops/pr-babysitter.md');
    assert.match(guide, /wait\s*\|\s*retry-check\s*\|\s*request-repair\s*\|\s*escalate\s*\|\s*ready-for-human/i);
    for (const field of ['headSha', 'baseSha', 'mergeSha', 'testedSha']) {
      assert.match(guide, new RegExp(field, 'i'));
    }
    assert.match(guide, /testedSha[\s\S]*head SHA[\s\S]*merge SHA/i);
    assert.match(guide, /neutral[\s\S]*skipped[\s\S]*green/i);
  });

  it('requires complete required-check and required-workflow evidence and keeps budgets host-owned', async () => {
    const [guide, agents, phase2aPlan] = await Promise.all([
      read('.agent/loops/pr-babysitter.md'),
      read('AGENTS.md'),
      read('docs/superpowers/plans/2026-09-28-loop-engineering-phase-2a-pr-babysitter-core.md'),
    ]);
    assert.match(guide, /required-check[\s\S]*required-workflow/i);
    assert.match(guide, /unavailable[\s\S]*must not be treated as empty/i);
    assert.match(guide, /exactly one current evidence object.*each required/i);
    assert.match(guide, /maxWallClockSeconds[\s\S]*LoopState/i);
    assert.match(guide, /token[\s\S]*unknown[\s\S]*fails closed/i);
    assert.match(guide, /reconcile PR state[\s\S]*fresh snapshot[\s\S]*different tuple[\s\S]*rejected/i);
    assert.match(phase2aPlan, /reconcilePrBabysitterState\(state, currentPrSnapshot\)/);

    const loopContract = section(agents, 'Loop Engineering contract');
    assert.match(loopContract, /PR Babysitter.*head\/base\/merge SHA/i);
    assert.match(loopContract, /required workflow/i);
    assert.match(loopContract, /run-local.*token.*CI-run budgets.*LoopState/i);
  });

  it('documents packet privacy, fixed verifier commands, Phase 2A no-write boundaries, and human review', async () => {
    const guide = await read('.agent/loops/pr-babysitter.md');
    assert.match(guide, /Phase 2A[\s\S]*no GitHub API writes/i);
    assert.match(guide, /must not merge/i);
    assert.match(guide, /production/i);
    assert.match(guide, /escalation packets?[\s\S]*redacted[\s\S]*bounded/i);
    assert.match(guide, /repair packets?[\s\S]*exact branch[\s\S]*path scope/i);
    assert.match(guide, /fixed verifier registry/i);
    assert.match(guide, /review comment bodies[\s\S]*excluded[\s\S]*never persisted/i);
    assert.match(guide, /Phase 2B[\s\S]*rerun[\s\S]*push/i);
  });

  it('keeps AGENTS and Wiki aligned with the current Phase 2 design', async () => {
    const [agents, concept, architecture, index, log] = await Promise.all([
      read('AGENTS.md'),
      read('Wiki/concepts/loop-engineering.md'),
      read('Wiki/architecture.md'),
      read('Wiki/index.md'),
      read('Wiki/log.md'),
    ]);
    const loopContract = section(agents, 'Loop Engineering contract');
    assert.match(loopContract, /Phase 2B host[\s\S]*maxWallClockSeconds[\s\S]*LoopState/i);
    assert.match(concept, /head\/base\/merge SHA tuple/i);
    assert.match(concept, /required workflow/i);
    assert.match(concept, /host owns run-local budgets through `LoopState`/i);
    assert.match(architecture, /Phase 2A PR Babysitter[\s\S]*Phase 2B/i);
    assert.match(index, /^\*\*Last updated:\*\* 2026-09-29$/m);
    assert.match(index, /\[\[loop-engineering\]\]/);
    assert.match(log.trimEnd().split(/\r?\n/).at(-1), /^- 2026-09-29 - Codex - .*staged runbook, host-injected CLI limitation, and contents-token budget checks/i);
  });

  it('plans GitHub workflow evidence and write gates against trusted revision and budget state', async () => {
    const plan = await read('docs/superpowers/plans/2026-09-28-loop-engineering-phase-2b-github-runner-integration.md');
    assert.match(plan, /required workflow source identity[\s\S]*repositoryId, path, ref, sha[\s\S]*testedSha/i);
    assert.match(plan, /baseRefOid[\s\S]*headRefOid[\s\S]*potentialMergeCommit\.oid/i);
    assert.match(plan, /baseSha[\s\S]*headSha[\s\S]*mergeSha/i);
    assert.match(plan, /LoopState` to schema v2[\s\S]*`ciRunAttempts`/i);
    assert.match(plan, /finite configured `ciRunLimit`[\s\S]*observe-only/i);
    assert.match(plan, /evaluateBudgets` before every model request, verifier run, and push/i);
  });
});
