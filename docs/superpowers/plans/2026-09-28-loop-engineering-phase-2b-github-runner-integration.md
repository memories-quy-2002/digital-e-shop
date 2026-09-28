# Loop Engineering Phase 2B — GitHub Runner Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the Phase 2A PR Babysitter core to GitHub in a least-privilege local/self-hosted runner so it can observe PR checks, boundedly rerun confirmed flaky CI, request same-branch repairs, and escalate safely without auto-merge or production authority.

**Architecture:** Keep GitHub as the authoritative CI/security plane and keep model/coding execution outside GitHub Actions. Add a strict GitHub REST adapter and a local CLI that operates on an explicitly selected PR, verifies repository/branch/head ownership, feeds normalized evidence to Phase 2A, and performs only allowlisted actions. Repair is a handshake with the host coding agent: the babysitter emits a `RepairPacket`, the host performs the code change in the approved worktree, then the babysitter resumes against a new head SHA.

**Tech Stack:** Node.js 24.20.x built-in `fetch`, existing Git/GitHub repository, Phase 1 + Phase 2A Loop Engineering modules, GitHub REST API, `node:test`.

**Spec:** `docs/superpowers/specs/2026-09-27-loop-engineering-foundation-design.md`

**Prerequisite:** Complete and merge Phase 2A before executing Phase 2B, or rebase this branch so all Phase 2A interfaces exist unchanged.

## Global Constraints

- No autonomous merge, branch-protection bypass, production migration/reset, production data mutation, secrets administration, or Vercel production promotion.
- Do not use `pull_request_target` to execute repository code.
- The runner operates only on an explicitly supplied repository + PR number; no broad repository polling in Phase 2B.
- Initial rollout is observe-only. GitHub write actions are unlocked one capability at a time after dry-run evidence.
- GitHub token scope must be minimal. Read-only observation uses Metadata/Pull requests/Checks/Actions read. Flaky rerun requires Actions write. Branch push uses a separate branch-scoped Git credential or equivalent repository Contents write; do not reuse a production/deployment credential.
- Never send the GitHub token to a host other than the configured GitHub API origin.
- Do not persist tokens, request authorization headers, complete CI logs, or raw review comments.
- Fork PRs are observation-only; no rerun/push/repair.
- Repair requires matching local task/PR state, same repository, non-`main` head branch, exact current head SHA, and risk approval for all affected paths.
- A coding agent may consume only a sanitized `RepairPacket`; arbitrary PR/review text is not automatically appended to its prompt.
- Existing GitHub CI, Security, CodeQL, production migration, and demo-seed workflows remain authoritative and unchanged except for the explicit read-only Loop Foundation test-list update required to cover new control-plane tests.
- Persistent Playwright E2E remains deferred; current repo history intentionally removed the previous E2E project.

## Review Focus

1. **TOCTOU/head drift:** the PR head changing between decision and write must abort the write and force re-observation.
2. **Credential exfiltration:** malicious repository text/URLs must never redirect authenticated GitHub requests or leak Authorization headers.
3. **Fork/foreign branch repair:** a PR whose head repository/branch is not the approved same-repo branch must remain observation-only.
4. **Retry storms:** workflow/job reruns must be idempotent, revision-bound, and capped by `maxFlakyRetries` and optional CI-run budget.
5. **Unsafe repair handoff:** a repair result that changes protected/unapproved paths or does not advance the expected branch SHA must be rejected before another CI retry.

---

### Task 1: Implement a strict GitHub read adapter

**Files:**
- Create: `scripts/loop/github-pr-client.mjs`
- Create: `scripts/loop/__tests__/github-pr-client.test.mjs`

**Interfaces:**
- Produces: `createGitHubPrClient({ repository, token, apiOrigin?, fetchImpl? })`
- Read methods:
  - `getPullRequest(prNumber)`
  - `getCommitCheckRuns(headSha)`
  - `getWorkflowRuns(headSha)`
  - `getWorkflowRunJobs(runId)`
  - `getJobLog(jobId, options)`
  - `getReviewMetadata(prNumber)`

- [ ] **Step 1: Write failing client tests with mocked fetch**

Assert:
- only HTTPS GitHub API origin is accepted;
- repository is fixed at client construction and cannot be overridden by response/user text;
- Authorization header is sent only to the configured API origin;
- pagination is bounded;
- response-size limits are enforced;
- 401/403/rate-limit/network failures become stable typed errors;
- logs are redacted/truncated before leaving the adapter;
- no raw review body is returned from `getReviewMetadata`; retain IDs, author, state, timestamps, and file/path metadata only.

- [ ] **Step 2: Run tests and verify they fail**

```bash
node --test scripts/loop/__tests__/github-pr-client.test.mjs
```

- [ ] **Step 3: Implement read-only adapter**

Use built-in `fetch`; no Octokit dependency in Phase 2B.

Bind check/workflow observations to the exact head SHA before returning them to Phase 2A normalizers.

- [ ] **Step 4: Run tests and verify they pass**

- [ ] **Step 5: Commit**

```bash
git add scripts/loop/github-pr-client.mjs scripts/loop/__tests__/github-pr-client.test.mjs
git commit -m "feat(loop): add GitHub PR observation adapter"
```

---

### Task 2: Add local repository and branch ownership guards

**Files:**
- Create: `scripts/loop/pr-worktree-guard.mjs`
- Create: `scripts/loop/__tests__/pr-worktree-guard.test.mjs`

**Interfaces:**
- Produces: `inspectPrWorktree(repoRoot, prSnapshot, prState): Promise<WorktreeGuardResult>`
- Produces: `assertRepairWorkspace(result, approval): void`

Guard must verify:
- repository root realpath is a Git checkout;
- current branch equals PR head ref;
- branch is not `main`;
- PR base is `main`;
- PR head repository equals base repository;
- local HEAD equals PR head SHA before repair;
- workspace fingerprint is captured before repair;
- saved task/PR state references the same branch and head SHA.

- [ ] **Step 1: Write failing guard tests using temporary git repositories**

Cover correct branch, detached HEAD, main branch, fork PR, stale local HEAD, mismatched state, symlink escape, and dirty-worktree behavior.

Dirty worktree may be allowed only if the host explicitly identifies the Phase 1 task worktree and the fingerprint is persisted; arbitrary pre-existing changes must block repair.

- [ ] **Step 2: Run tests and verify they fail**

- [ ] **Step 3: Implement guards using fixed `git` argument vectors**

No shell interpolation. No automatic checkout/reset/clean.

- [ ] **Step 4: Run tests and verify they pass**

- [ ] **Step 5: Commit**

```bash
git add scripts/loop/pr-worktree-guard.mjs scripts/loop/__tests__/pr-worktree-guard.test.mjs
git commit -m "feat(loop): guard PR repair worktrees"
```

---

### Task 3: Implement bounded flaky workflow reruns

**Files:**
- Modify: `scripts/loop/github-pr-client.mjs`
- Create: `scripts/loop/github-actions-write.mjs`
- Create: `scripts/loop/__tests__/github-actions-write.test.mjs`

**Interfaces:**
- Produces: `rerunFailedJobs(input): Promise<RerunResult>`
- Requires an explicit capability object `{ actionsWriteApproved: true, approvedAt, repository }`.
- Consumes Phase 2A decision `action === "retry-check"` only.

- [ ] **Step 1: Write failing rerun tests**

Assert:
- write method rejects absent/false capability;
- stale head SHA aborts before POST;
- only the allowlisted GitHub Actions rerun endpoint is writable;
- only failed-job/workflow reruns are supported; arbitrary dispatch/cancel/delete is unsupported;
- duplicate rerun of the same attempt key is idempotently refused;
- Phase 1 `maxFlakyRetries` and CI-run budget are checked before POST;
- 409/422/rate-limit/network responses do not mutate product code and become escalation-compatible reason codes.

- [ ] **Step 2: Run tests and verify they fail**

- [ ] **Step 3: Implement the minimal write adapter**

Keep Actions write capability separate from the general read client so observe-only mode cannot accidentally call a write endpoint.

- [ ] **Step 4: Run tests and verify they pass**

- [ ] **Step 5: Commit**

```bash
git add scripts/loop/github-pr-client.mjs scripts/loop/github-actions-write.mjs scripts/loop/__tests__/github-actions-write.test.mjs
git commit -m "feat(loop): add bounded flaky CI reruns"
```

---

### Task 4: Implement the repair handshake without embedding a model vendor

**Files:**
- Create: `scripts/loop/repair-session.mjs`
- Create: `scripts/loop/__tests__/repair-session.test.mjs`

**Interfaces:**
- Produces: `beginRepairSession(input): RepairSession`
- Produces: `validateRepairResult(session, result, context): RepairValidation`
- `RepairSession` contains:
  - session ID;
  - PR/head SHA/branch;
  - original workspace fingerprint;
  - allowed path scope;
  - risk level/approval scope;
  - failed check IDs/fingerprints;
  - verification requirements;
  - remaining budgets.
- The coding host returns:
  - new head SHA;
  - new workspace fingerprint;
  - changed paths;
  - verification result;
  - optional token usage totals.

- [ ] **Step 1: Write failing repair-session tests**

Assert:
- no `exec`, shell command, model name, prompt, or arbitrary executable is accepted;
- session is bound to exact original head SHA;
- result must advance the branch SHA after a committed repair;
- changed paths must be within approved scope and re-run deterministic risk classification;
- newly touched high/protected path without matching approval rejects the repair;
- critical path/action always rejects;
- verification must be revision/workspace stable;
- repeated same-failure and iteration budgets remain enforced.

- [ ] **Step 2: Run tests and verify they fail**

- [ ] **Step 3: Implement the vendor-neutral handshake**

This is intentionally not a model runner. ChatGPT/Codex/another host can consume the `RepairPacket`, edit the isolated branch, run verification, commit, and return structured results.

- [ ] **Step 4: Run tests and verify they pass**

- [ ] **Step 5: Commit**

```bash
git add scripts/loop/repair-session.mjs scripts/loop/__tests__/repair-session.test.mjs
git commit -m "feat(loop): add guarded PR repair sessions"
```

---

### Task 5: Add the PR Babysitter CLI orchestrator

**Files:**
- Create: `scripts/loop/pr-babysitter-cli.mjs`
- Create: `scripts/loop/__tests__/pr-babysitter-cli.test.mjs`

**Interfaces:**
- Commands:
  - `inspect --repo owner/name --pr N`
  - `decide --repo owner/name --pr N`
  - `rerun-flaky --repo owner/name --pr N`
  - `begin-repair --repo owner/name --pr N`
  - `validate-repair --repo owner/name --pr N --result <path>`
  - `escalation --repo owner/name --pr N`
- Default mode is observe-only.

- [ ] **Step 1: Write failing CLI tests**

Use injected clients/adapters. Assert:
- no network/write happens in `--dry-run`;
- write commands require explicit capability flags/environment configuration;
- PR number/repository parsing is strict;
- token values never appear in stdout/stderr;
- every command refreshes the current PR head before actionable write/repair;
- exit codes distinguish ready/wait/escalated/refused/infrastructure error.

- [ ] **Step 2: Run tests and verify they fail**

- [ ] **Step 3: Implement CLI orchestration**

Sequence:
1. fetch latest PR snapshot;
2. load/reset revision-bound state;
3. collect normalized checks;
4. call Phase 2A decision engine;
5. emit/update telemetry;
6. perform only the explicitly selected allowlisted action.

- [ ] **Step 4: Run tests and verify they pass**

- [ ] **Step 5: Commit**

```bash
git add scripts/loop/pr-babysitter-cli.mjs scripts/loop/__tests__/pr-babysitter-cli.test.mjs
git commit -m "feat(loop): add PR babysitter CLI"
```

---

### Task 6: Extend the read-only Loop Foundation CI to test Phase 2

**Human gate:** This task modifies `.github/workflows/**`, which remains high-risk by policy. The implementation executor must obtain explicit approval for this workflow-file write even though the resulting workflow stays read-only.

**Files:**
- Modify: `.github/workflows/loop-foundation.yml`
- Modify: `scripts/loop/__tests__/workflow.test.mjs`

- [ ] **Step 1: Update the workflow contract test first**

Require the workflow to run all new Phase 2A/2B Node tests while preserving:
- `contents: read`;
- pinned action SHAs;
- no secrets;
- no GitHub write permissions;
- no package installation;
- no `pull_request_target`;
- no product/production operations.

- [ ] **Step 2: Run workflow test and verify it fails**

- [ ] **Step 3: Update only the test list in `loop-foundation.yml`**

Do not add a workflow that automatically runs the PR Babysitter with write credentials.

- [ ] **Step 4: Run the complete control-plane test suite**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/loop-foundation.yml scripts/loop/__tests__/workflow.test.mjs
git commit -m "ci(loop): verify PR babysitter control plane"
```

---

### Task 7: Roll out in three capability stages

**Files:**
- Modify: `.agent/loops/pr-babysitter.md`
- Create: `docs/loop-engineering/phase-2-pr-babysitter-runbook.md`
- Create: `scripts/loop/__tests__/pr-runbook.test.mjs`

**Interfaces:** operational runbook and explicit promotion gates.

- [ ] **Step 1: Write failing runbook contract tests**

Require these stages:

**Stage 0 — observe-only**
- read PR/check metadata;
- classify and emit decision/escalation;
- no GitHub write;
- no code repair.

**Stage 1 — flaky rerun**
- unlock Actions write only;
- rerun only confirmed flaky failures;
- no code repair.

**Stage 2 — repair handshake**
- enable repair packets/sessions on same-repo approved branches;
- host agent may edit/verify/commit/push the PR branch;
- still no merge.

- [ ] **Step 2: Define promotion metrics**

Before moving Stage 0 -> 1:
- at least 10 representative failed/pending PR observations;
- 0 stale-SHA actionable decisions;
- 0 protected/infrastructure cases misclassified as branch-caused;
- telemetry contains no secrets/raw review bodies.

Before moving Stage 1 -> 2:
- at least 10 bounded rerun decisions or sufficient representative fixtures if real flaky failures are rare;
- no retry-budget overruns;
- no duplicate reruns;
- operator understands the separate branch-write credential boundary.

Stage 2 remains human-reviewed before merge indefinitely in Phase 2.

- [ ] **Step 3: Write runbook**

Include exact CLI examples with placeholders only; never include real tokens.

- [ ] **Step 4: Run contract tests and verify they pass**

- [ ] **Step 5: Commit**

```bash
git add .agent/loops/pr-babysitter.md docs/loop-engineering/phase-2-pr-babysitter-runbook.md scripts/loop/__tests__/pr-runbook.test.mjs
git commit -m "docs(loop): add PR babysitter rollout runbook"
```

---

### Task 8: Final Phase 2B verification and security review

**Files:** verify-only unless real defects are found.

- [ ] **Step 1: Run the full Phase 1 + Phase 2 control-plane suite**

Expected: all PASS.

- [ ] **Step 2: Run mocked GitHub scenario matrix**

At minimum:
- green same-repo draft PR;
- stale head during rerun;
- flaky check within/exhausted budget;
- infrastructure error;
- fork PR;
- protected-path failure;
- branch-caused repair request;
- repair result touching newly protected path;
- token/rate-limit error;
- duplicate delivery/retry.

- [ ] **Step 3: Execute Stage 0 against a real non-production PR**

Observe only. Confirm normalized check IDs/head SHA and decisions match GitHub UI. Do not enable write permissions.

- [ ] **Step 4: Review credentials and permissions**

Document which credential is used for:
- GitHub read;
- Actions rerun;
- branch push.

Confirm none can merge/bypass protection/administer secrets/run production migration/reset/promote deployment.

- [ ] **Step 5: Confirm non-goals**

No auto-merge, no `pull_request_target`, no autonomous review-comment execution, no production mutation, no persistent Playwright E2E, no vendor-specific model runner.

- [ ] **Step 6: Record Phase 2 telemetry for Phase 3 decision**

Track:
- classification accuracy after human review;
- stale-evidence refusals;
- flaky rerun success rate;
- repair-request success rate;
- median repair iterations;
- CI runs per successful PR;
- token usage per repair when host exposes it;
- human intervention reasons.

## Playwright Decision Gate

Do **not** recreate the removed persistent Playwright E2E project as part of this plan.

After Phase 2 reaches stable Stage 2 usage, create a separate bounded design/plan only if browser evidence is materially missing from current Vitest + preview smoke coverage. Prefer a minimal credential-free smoke journey on disposable/local data; never run payment/customer mutations against production.

## Self-Review Result

- GitHub observation, GitHub write capability, and code-repair capability are separate privilege layers.
- Every write is revision-bound and subject to TOCTOU re-check.
- The babysitter cannot merge or obtain production authority.
- Model/vendor execution is deliberately externalized behind a structured repair handshake.
- Playwright remains deferred in line with current repository history and YAGNI.
