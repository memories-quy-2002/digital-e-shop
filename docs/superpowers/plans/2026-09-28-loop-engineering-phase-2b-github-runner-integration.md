# Loop Engineering Phase 2B — GitHub Runner Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the Phase 2A PR Babysitter core to GitHub in a least-privilege local/self-hosted runner so it can observe PR checks, boundedly rerun confirmed flaky CI, request same-branch repairs, and escalate safely without auto-merge or production authority.

**Architecture:** Keep GitHub as the authoritative CI/security plane and keep model/coding execution outside GitHub Actions. Add a strict GitHub REST adapter and a local CLI that operates on an explicitly selected PR, verifies repository/branch/head ownership, feeds normalized evidence to Phase 2A, and performs only allowlisted actions. For repair, the babysitter emits a sanitized `RepairPacket`; the coding agent returns an untrusted patch proposal; the trusted host validates and applies only the approved paths, runs verification, and controls the branch update.

**Tech Stack:** Node.js 24.20.x built-in `fetch`, existing Git/GitHub repository, Phase 1 + Phase 2A Loop Engineering modules, GitHub REST API, `node:test`.

**Spec:** `docs/superpowers/specs/2026-09-27-loop-engineering-foundation-design.md`

**Prerequisite:** Complete and merge Phase 2A before executing Phase 2B, or rebase this branch so all Phase 2A interfaces exist unchanged.

## Global Constraints

- No autonomous merge, branch-protection bypass, production migration/reset, production data mutation, secrets administration, or Vercel production promotion.
- Do not use `pull_request_target` to execute repository code.
- The runner operates only on an explicitly supplied repository + PR number; no broad repository polling in Phase 2B.
- Initial rollout is observe-only. GitHub write actions are unlocked one capability at a time after dry-run evidence.
- GitHub authentication uses a dedicated GitHub App installed only on the target repository. Do not reuse Codex `@GitHub` connector credentials; the runner must obtain its own runtime credentials.
- The App private key is loaded only through a trusted host secret provider and never from the PR checkout, `.loop/state/`, or tracked environment files. The host mints installation access tokens for the fixed repository ID and the smallest permission set for the current capability. GitHub supports restricting an installation token to selected repositories and permissions; the token expires after one hour ([GitHub installation tokens](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app)).
- Stage 0 observation uses only Metadata/Pull requests/Checks/Actions read. Required-check discovery uses the minimum read permission for the selected branch-protection/ruleset source; GitHub's protected-branch endpoint requires Administration read ([GitHub permissions](https://docs.github.com/en/rest/branches/branch-protection)). Stage 1 tokens add only Actions write. Stage 2 tokens add only Contents write. App permission expansion is a separate human-reviewed setup step; no token may request permissions the App was not granted.
- Branch updates use a repository-scoped, short-lived Contents-write token only after the repair approval gate. The token itself is not branch-scoped: enforce the exact non-`main` ref and expected head SHA in the host, and rely on GitHub branch protection as the server-side boundary. Never reuse a production/deployment credential.
- GitHub is the human identity provider through the dedicated App's user authorization flow. The local CLI uses device flow, resolves the signed-in principal from GitHub's `/user` endpoint, and holds the user token in memory only. The host checks the immutable user ID against an approver allowlist from trusted host configuration and verifies the user's effective repository permission for the requested capability. GitHub App user tokens are limited by both App and user permissions ([GitHub user tokens and device flow](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app)).
- GitHub login proves who the approver is; it does not approve an operation. Before Stage 1 or Stage 2, an interactive TTY must display the repository, PR number, head SHA, capability, exact path scope, and expiry and receive explicit confirmation. No TTY, cancelled/expired login, untrusted user, insufficient repository permission, or failed scope check keeps the run observe-only.
- GitHub API writes use the App installation identity after approval, so GitHub records the App as the actor. The host's compact audit metadata must record the authenticated approver ID and approval ID; never claim that GitHub's API actor is the human approver.
- Never send the GitHub token to a host other than the configured GitHub API origin.
- Do not persist App private keys, installation/user/refresh tokens, request authorization headers, complete CI logs, or raw review comments.
- Fork PRs are observation-only; no rerun/push/repair.
- The effective required-check policy and all check observations must be collected completely for the current base ref and head SHA. An unavailable policy, incomplete pagination, or failed source read is unknown, never an empty set; unknown evidence cannot trigger retry/repair or `ready-for-human`.
- Every decision, approval, retry target, and repair session binds to the current `{ baseSha, headSha, mergeSha }` tuple. Check/workflow observations additionally carry `testedSha`; accept only the current head or verified current merge SHA. Refresh the tuple after paginated collection and discard the batch if it changed.
- Required-workflow rules are identified by the exact `{ repositoryId, path, ref, sha }` from the effective ruleset. Missing source ref/SHA, inaccessible source repository, or incomplete ruleset collection makes the policy unavailable; do not match by workflow display name or infer an empty workflow set. Preserve all four fields from GitHub's [ruleset rules API](https://docs.github.com/en/rest/repos/rules).
- Do not depend on REST `merge_commit_sha`: GitHub removed it from pull-request payloads in API version `2026-03-10`. Read `baseRefOid`, `headRefOid`, `potentialMergeCommit.oid`, and mergeability from the pull-request GraphQL object, cross-check the base/head against the REST PR response, and fail closed while the potential merge commit is absent or still being generated. [Pull request GraphQL fields](https://docs.github.com/en/graphql/reference/pulls) and [REST breaking change](https://docs.github.com/en/rest/about-the-rest-api/breaking-changes).
- Host run-local wall-clock, token, and CI-run budgets come from validated `LoopState`. Call `evaluateBudgets` before every model request, verifier run, and push. When a token limit is enabled and usage is unknown, stop before a model request. For CI writes, `reserveCIRunAttempt` checks the budget and atomically persists the stable action-attempt key plus consumed CI counter before POST; uncertain network outcomes remain consumed and cannot be replayed.
- Reruns require an allowlist loaded from protected base-branch policy or trusted host configuration. It must name workflow and job IDs whose contract gives PR code no secrets, protected environment, or write-capable token. Refuse reruns when the PR changes a workflow or reusable-workflow definition, when the run/job is outside the allowlist, or when the privilege state is unknown. `pull_request_target` being disabled does not by itself make a `pull_request` rerun safe. See [GitHub rerun semantics](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/re-run-workflows-and-jobs) and [pull request workflow events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows).
- Caller-supplied booleans, timestamps, paths, CLI flags, and environment variables are not approval. Writes require an approval attestation verified by a trusted host adapter and bound to repository, PR number, current base/head/merge SHA tuple, requested capability, exact repair paths, and expiry. Without a trusted verifier, keep every write stage disabled and remain observe-only; critical paths and actions remain prohibited.
- Repair requires matching local task/PR state, same repository, non-`main` head branch, exact current base/head/merge SHA tuple, and a verified approval for all affected paths.
- The host approval provider returns an opaque, in-process, single-use result bound to repository ID, PR number, current base/head/merge SHA tuple, requested capability, exact repair paths, authenticated approver ID, and expiry. It must reject caller-created or serialized results and prevent replay. Approval metadata may be persisted only as compact IDs/hashes/status; tokens and the full attestation are never persisted. Phase 1 policy still classifies local writes. The coding agent returns a patch proposal but has no direct write access to the trusted worktree or GitHub credentials. The trusted host checks the patch paths against policy, obtains and consumes a `repair:workspace` approval before applying it, and runs the fixed verifier itself. After verifying the final diff, `validate-repair` obtains a fresh `contents:write` approval and consumes it in the same process before pushing. Process exit or expiry invalidates any unconsumed approval. Never carry an executable approval through a `RepairPacket` or `.loop/state/`. Stage 1 and Stage 2 stay disabled until this provider is wired and reviewed.
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

### Task 0: Add dedicated GitHub App authentication and approval

**External setup before live observation:**
- Register a project-owned GitHub App, enable device flow, and install it only on the target repository.
- Keep the App private key in an OS or managed host secret store. Configure the App with the Stage 0 read permissions only; add `Actions: write` or `Contents: write` only in a separately reviewed stage unlock.
- Configure trusted approver GitHub numeric user IDs in host configuration outside the PR checkout. Do not put the approver allowlist in a PR-editable file.

**Files:**
- Create: `scripts/loop/github-auth-provider.mjs`
- Create: `scripts/loop/__tests__/github-auth-provider.test.mjs`

**Interfaces:**
- Produces: `createGitHubAuthProvider({ appId, appClientId, installationId, repositoryId, getAppPrivateKey, trustedApproverIds, fetchImpl, prompt, clock })`
- Produces: `authenticateApprover(): Promise<GitHubPrincipal>` using the App user authorization device flow. Resolve the principal from GitHub, not caller input; keep the OAuth token private and in memory.
- Produces: `getInstallationToken(capability): Promise<string>` where `capability` is one of `observe`, `actions:rerun`, or `contents:write`. Use a fixed internal permission map and `repository_ids: [repositoryId]`; do not accept caller-supplied permission maps.
- Produces: `requestApproval(scope): Promise<VerifiedApproval>` and `consumeApproval(approval, expectedScope): void`. Approval capabilities are `actions:rerun`, `repair:workspace`, and `contents:write`. Every approval binds the current `{ baseSha, headSha, mergeSha }` tuple (with `mergeSha: null` only when no current merge SHA exists), repository ID, PR number, capability, exact path scope, authenticated user ID, and expiry. Any tuple change invalidates the approval. The approval is opaque, non-serializable, and single-use.

- [x] **Step 1: Write failing provider tests with mocked fetch, clock, and TTY prompt**

Cover:
- device-flow pending/polling, cancellation, expiry, and successful identity resolution from `/user`;
- reject an approver ID supplied by caller, an ID absent from trusted host configuration, or a user without the repository permission required by the requested capability;
- require at least effective repository `write` permission for Stage 1/2 approval, in addition to the trusted user-ID allowlist;
- installation-token requests always target the configured installation and one repository ID, and request only the fixed permission map for the capability;
- missing App permission, inaccessible installation, or token-generation failure blocks the operation without fallback credentials;
- no TTY or a cancelled confirmation cannot issue approval;
- approval binds repository ID, PR number, base/head/merge SHA tuple, capability, exact paths, approver ID, and expiry; wrong-scope, stale-tuple, expired, modified, serialized, or replayed approvals are rejected;
- a base advance, head update, or merge SHA refresh between approval and action invalidates the approval before any write;
- `repair:workspace` approval is consumed by the trusted host before applying the agent's patch; reject unsafe/out-of-scope patch paths before the first worktree write, and give the agent no direct worktree-write capability or credential;
- Stage 2 cannot reuse approval from `begin-repair`; `validate-repair` obtains a fresh `contents:write` approval after inspecting the final changed paths and consumes it in that same invocation;
- App keys and all tokens are absent from output, errors, loop state, and logs; authenticated requests stay on the configured GitHub API origin.

- [x] **Step 2: Run tests and verify they fail**

```bash
node --test scripts/loop/__tests__/github-auth-provider.test.mjs
```

- [x] **Step 3: Implement the provider with built-in `node:crypto` and `fetch`**

Generate App JWTs only inside the trusted host, create repository-scoped installation tokens with a capability-specific permission subset, and implement GitHub App device flow for the human approver. Resolve and authorize the GitHub principal before showing the exact operation scope for TTY confirmation. Keep credentials in memory and return only opaque approval handles to loop modules.

- [x] **Step 4: Run tests and verify they pass**

- [x] **Step 5: Commit**

```bash
git add scripts/loop/github-auth-provider.mjs scripts/loop/__tests__/github-auth-provider.test.mjs
git commit -m "feat(loop): add GitHub App auth provider"
```

---

### Task 1: Implement a strict GitHub read adapter

**Files:**
- Create: `scripts/loop/github-pr-client.mjs`
- Create: `scripts/loop/__tests__/github-pr-client.test.mjs`

**Interfaces:**
- Produces: `createGitHubPrClient({ repository, getToken, apiOrigin?, graphqlOrigin?, fetchImpl?, downloadHostAllowlist? })`, with tokens fixed to `getInstallationToken("observe")` from the trusted App provider
- Read methods:
  - `getPullRequest(prNumber)`, combining REST PR metadata with GraphQL `baseRefOid`, `headRefOid`, `potentialMergeCommit.oid`, and mergeability
  - `getCommitCheckRuns(testedSha)` for each of the current head SHA and current merge SHA when present
  - `getWorkflowRuns(testedSha)` for each of the current head SHA and current merge SHA when present
  - `getRequiredWorkflowEvidence(requiredWorkflow, testedSha)` keyed by the exact required workflow source identity and the PR commit SHA tested by that run
  - `getWorkflowRunJobs(runId)`
  - `getRequiredCheckSnapshot({ baseRef, headSha })`
  - `getJobLog(jobId, options)`
  - `getReviewMetadata(prNumber)`

- [x] **Step 1: Write failing client tests with mocked fetch**

Assert:
- only HTTPS GitHub API origin is accepted;
- repository is fixed at client construction and cannot be overridden by response/user text;
- Authorization header is sent only to the configured API origin;
- pagination is bounded;
- all applicable branch-protection/ruleset sources are read, and an unavailable or partial policy is returned as unavailable rather than an empty set;
- check-run/workflow/job pagination failures mark the check collection incomplete;
- observations carry `{ baseSha, headSha, mergeSha, testedSha }`; unrelated tested SHAs are stale;
- a required-workflow observation carries its canonical required workflow key `{ repositoryId, path, ref, sha }` separately from the PR `testedSha`;
- workflow evidence is matched to the exact repository/path/ref/source-SHA identity and run metadata, never by display name alone; a missing/ambiguous identity cannot be green;
- current merge-SHA evidence is accepted only when the GraphQL `potentialMergeCommit.oid` is current and the REST base/head values agree;
- after checks and rules are collected, a refreshed PR tuple mismatch discards the batch and requires a fresh bounded collection;
- required workflow rules normalize exact `{ repository_id, path, ref, sha }` identities; missing ref/SHA or inaccessible source repositories yield `unavailable`, never an empty workflow set;
- API payloads with an absent `potentialMergeCommit` while GitHub is generating it are unavailable for merge-tested evidence;
- response-size limits are enforced;
- 401/403/rate-limit/network failures become stable typed errors;
- logs are redacted/truncated before leaving the adapter;
- no raw review body is returned from `getReviewMetadata`; retain IDs, author, state, timestamps, and file/path metadata only.
- authenticated API requests do not follow redirects automatically;
- a job-log `302` is followed only to an explicitly configured HTTPS download-host allowlist, without Authorization or cookies;
- off-allowlist redirects and redirect chains are rejected; signed download URLs are not logged or persisted.

- [x] **Step 2: Run tests and verify they fail**

```bash
node --test scripts/loop/__tests__/github-pr-client.test.mjs
```

- [x] **Step 3: Implement read-only adapter**

Use built-in `fetch`; no Octokit dependency in Phase 2B. REST calls pin a supported API version. The current PR REST response is cross-checked with the GraphQL revision tuple because REST API `2026-03-10` no longer returns `merge_commit_sha`. Set authenticated requests to manual redirect handling. The workflow-jobs log endpoint returns a temporary redirect, so validate its `Location`, fetch the download without GitHub authorization headers, enforce size/time limits, redact the content, and discard the signed URL. See [GitHub job log API](https://docs.github.com/en/rest/actions/workflow-jobs).

Bind each check/workflow observation to the exact current base/head/merge tuple and its `testedSha` before returning it to Phase 2A normalizers. The `testedSha` must equal the PR head SHA or GraphQL `potentialMergeCommit.oid`. Keep the PR commit under test separate from the required-workflow source identity `{ repositoryId, path, ref, sha }`; verify each field against the effective ruleset and the workflow definition/run metadata rather than a display name. Read branch protection and all applicable repository/organization rulesets; normalize required workflow files using repository ID, path, ref, and source SHA. If a cross-repository workflow source is inaccessible, or any required field/source/page is unavailable, return an unavailable policy snapshot. Refresh PR base/head/merge values after all pages are collected; if any component changed, discard the evidence and recollect rather than mixing snapshots. Return `checkCollectionComplete: true` only after every required source and page was read successfully. Preserve the distinction between a confirmed complete empty required-check set and unavailable policy data.

**Confirmed Phase 2B decision:** current Actions run metadata supplies the workflow path/ref and the PR `head_sha`, but the adapter has no trusted attestation of the required workflow source SHA. Therefore `getRequiredWorkflowEvidence` returns `unavailable` until a trusted source can attest the exact `{ repositoryId, path, ref, sha }`; matching a run by display name, path, or ref alone must never produce green evidence.

The new tests are verified locally. Wiring them into the fixed local verifier (`scripts/loop/verify.mjs`) or hosted workflow (`.github/workflows/loop-foundation.yml`) is a separate protected-path change and remains pending explicit path-scope approval.

- [x] **Step 4: Run tests and verify they pass**

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
- Produces: `inspectPrWorktree(repoRoot, prSnapshot, hostContext): Promise<WorktreeGuardResult>`
- `hostContext` contains the validated PR state and LoopState, matching `taskId` and `taskWorktreeId`, exact `allowedPaths`, the trusted approval provider, and a trusted `refreshPrSnapshot` callback. An optional persisted workspace fingerprint is accepted only when it matches the freshly captured fingerprint.
- Produces: `assertCurrentPrTuple(result): Promise<PrSnapshot>`, which refreshes repository/PR identity and the full base/head/merge tuple through the trusted host callback before each later repair stage.
- Produces: `assertRepairWorkspace(result, verifiedApproval): Promise<void>`, which refreshes the tuple immediately before consuming the provider-issued `repair:workspace` approval for the exact path scope.

Guard must verify:
- repository root realpath is a Git checkout;
- current branch equals PR head ref;
- branch is not `main`;
- PR base is `main`;
- PR head repository equals base repository;
- local HEAD equals PR head SHA before repair;
- the current `{ baseSha, headSha, mergeSha }` tuple still equals the freshly observed PR tuple before approval consumption, patch application, verification, and push;
- workspace fingerprint is captured before repair;
- saved PR state references the same branch and full base/head/merge SHA tuple; `LoopState` must match the task and current head revision and remain the source of run budgets.
- A dirty worktree is accepted only for the identified Phase 1 task worktree when its persisted workspace fingerprint matches; arbitrary dirty files block repair.

- [x] **Step 1: Write failing guard tests using temporary git repositories**

Cover correct branch, detached HEAD, main branch, fork PR, stale local HEAD, advanced base SHA, changed merge SHA, mismatched tuple state, symlink escape, and dirty-worktree behavior.
- Reject caller-created approval objects and verified results bound to another repository, PR, head SHA, capability, expiry, or path scope.

Dirty worktree may be allowed only if the host explicitly identifies the Phase 1 task worktree and the fingerprint is persisted; arbitrary pre-existing changes must block repair. The host approval provider must authenticate the human decision; this guard must not create approval from caller data.

- [x] **Step 2: Run tests and verify they fail**

- [x] **Step 3: Implement guards using fixed `git` argument vectors**

No shell interpolation. No automatic checkout/reset/clean.

- [x] **Step 4: Run tests and verify they pass**

- [x] **Step 5: Commit**

```bash
git add scripts/loop/pr-worktree-guard.mjs scripts/loop/__tests__/pr-worktree-guard.test.mjs
git commit -m "feat(loop): guard PR repair worktrees"
```

---

### Task 3: Implement bounded flaky workflow reruns

**Files:**
- Modify: `scripts/loop/github-pr-client.mjs`
- Modify: `scripts/loop/github-auth-provider.mjs` to bind approval to the exact rerun target
- Create: `scripts/loop/github-actions-write.mjs`
- Modify: `scripts/loop/__tests__/github-pr-client.test.mjs`
- Modify: `scripts/loop/__tests__/github-auth-provider.test.mjs`
- Create: `scripts/loop/__tests__/github-actions-write.test.mjs`
- Modify: `scripts/loop/state.mjs` and `scripts/loop/__tests__/state.test.mjs` for atomic, idempotent CI-attempt reservation in validated `LoopState`

**Interfaces:**
- Produces: `rerunFailedJobs(input): Promise<RerunResult>`
- Produces: `reserveCIRunAttempt(state, actionAttemptKey): { state, status }`; the action key is a SHA-256 digest of the canonical repository/PR/SHA tuple, tested SHA, required identity, and failed attempt identity.
- Extend `LoopState` to schema v2 with a bounded `ciRunAttempts` ledger. `reserveCIRunAttempt` checks `evaluateBudgets`, increments `budgets.ciRuns`, and records the key in one state update before the network call; a repeated key never authorizes another POST. Invalid/v1 state fails closed without silent migration; begin a new run rather than resetting it implicitly.
- Produces: `finishCIRunAttempt(state, actionAttemptKey, status)`, where status is `submitted`, `rejected`, or `uncertain`; every status remains consumed and non-replayable.
- Stage 1 reruns require a finite configured `ciRunLimit`; if absent, remain observe-only. Persist the reserved key and incremented counter atomically before POST. Mark the reservation submitted, rejected, or uncertain afterward; an uncertain POST remains consumed and is never repeated under the same key.
- Requires a verified approval attestation for the `actions:rerun` capability, bound to the repository, PR number, current `{ baseSha, headSha, mergeSha }` tuple, target `testedSha`, and expiry. A raw `{ actionsWriteApproved: true, approvedAt, repository }` object is not authorization.
- The approval also binds the exact `{ workflowId, runId, runAttempt, failedJobIds, requiredIdentity }` target so a same-SHA run or job cannot be substituted after approval.
- Obtains a repository-scoped installation token restricted to the fixed `Actions:write` capability only after consuming the matching approval; never accepts a raw token or permission map from CLI input.
- Consumes Phase 2A decision `action === "retry-check"` only.
- Consumes only a target mapped from the observed attempt to its exact required check/workflow identity, `testedSha`, workflow ID, workflow run ID, failed job IDs, and current base/head/merge tuple; do not select a run from a display name or arbitrary CLI input.
- The trusted workflow allowlist pins the execution repository and exact required workflow source identity. The source repository in `{ repositoryId, path, ref, sha }` may differ from the PR repository; its SHA still needs independent host attestation. Allowlist stable job names and compare the exact numeric failed job IDs and run attempt from fresh evidence because GitHub assigns those IDs per run.

- [x] **Step 1: Write failing rerun tests**

Assert:
- write method rejects an absent or unverifiable approval attestation;
- write method rejects forged, expired, wrong-repository, wrong-PR, wrong-head, and wrong-capability attestations;
- stale head SHA aborts before POST;
- stale base SHA, changed merge SHA, or a target `testedSha` outside the current head/merge pair aborts before POST;
- only the allowlisted GitHub Actions rerun endpoint is writable;
- unallowlisted workflow/job IDs, PR-modified workflow definitions, secret-bearing/protected-environment jobs, and unknown privilege states are refused;
- a retry target cannot be substituted with a different run, job, attempt, or head SHA;
- only failed-job/workflow reruns are supported; arbitrary dispatch/cancel/delete is unsupported;
- duplicate rerun of the same stable action-attempt key is idempotently refused, including after the prior POST returned a network error;
- `reserveCIRunAttempt` atomically checks Phase 1 `maxFlakyRetries` and the validated `LoopState` budget, persists the stable action-attempt key, and consumes one CI-run attempt before POST; timeout/connection loss still consumes the budget and a repeated CLI invocation cannot duplicate the rerun;
- LoopState v1 or corrupt state does not auto-reset; duplicate reservation does not increment `ciRuns`; a finite CI-run limit admits its final reserved action exactly once; a null CI-run limit refuses Stage 1 writes;
- 409/422/rate-limit/network responses do not mutate product code and become escalation-compatible reason codes.

- [x] **Step 2: Run tests and verify they fail**

- [x] **Step 3: Implement the minimal write adapter**

Keep Actions write capability separate from the general read client so observe-only mode cannot accidentally call a write endpoint. Verify and consume the attestation through the trusted host adapter before POST; do not infer approval from CLI flags, environment variables, or caller-provided timestamps. Re-fetch the PR tuple after approval, mint a short-lived installation token limited to the target repository and the permission subset required for rerun, and revalidate the tuple immediately before reservation. Atomically reserve and persist the CI attempt as the final host-state operation before POST.

- [x] **Step 4: Run tests and verify they pass**

- [ ] **Step 5: Commit**

```bash
git add scripts/loop/github-pr-client.mjs scripts/loop/github-auth-provider.mjs scripts/loop/github-actions-write.mjs scripts/loop/state.mjs scripts/loop/__tests__/github-pr-client.test.mjs scripts/loop/__tests__/github-auth-provider.test.mjs scripts/loop/__tests__/github-actions-write.test.mjs scripts/loop/__tests__/state.test.mjs
git commit -m "feat(loop): add bounded flaky CI reruns"
```

---

### Task 4: Implement the repair handshake without embedding a model vendor

**Files:**
- Create: `scripts/loop/repair-session.mjs`
- Create: `scripts/loop/__tests__/repair-session.test.mjs`

**Interfaces:**
- Produces: `beginRepairSession(input): RepairSession`
- Produces: `validateRepairProposal(session, patchProposal, context): Promise<RepairValidation>`
- `RepairSession` contains:
  - session ID;
  - PR base/head/merge SHA tuple, branch, and current `testedSha` for the failed evidence;
  - original workspace fingerprint;
  - allowed path scope;
  - risk level/approval scope;
  - failed check IDs/fingerprints;
  - verification requirements;
  - remaining host budgets read from validated `LoopState`.
- A `RepairSession`/`RepairPacket` never contains the App private key, installation token, user token, or a reusable approval credential. The host alone obtains a Contents-write token after consuming the exact approval.
- The coding agent returns an untrusted patch proposal only; it cannot write to the trusted worktree or push the branch.
- The trusted host independently records after applying and verifying an approved patch:
  - new head SHA;
  - new workspace fingerprint;
  - changed paths derived from Git;
  - fixed-verifier result;
  - optional token usage totals from the host, if available.

- [ ] **Step 1: Write failing repair-session tests**

Assert:
- no `exec`, shell command, model name, prompt, or arbitrary executable is accepted;
- session is bound to exact original base/head/merge SHA tuple, `testedSha`, and workspace fingerprint;
- coding agent returns a patch proposal only and has no direct trusted-worktree write or GitHub credential;
- trusted host rejects malformed, traversal, symlink-escaping, case-aliased protected, or out-of-scope patch paths before the first worktree write;
- host obtains and consumes `repair:workspace` approval for the exact allowed paths before applying the patch;
- absence/expiry of the host approval blocks patch application, even if a caller supplies an approval flag;
- approval is verified and bound to the repository, PR, original base/head/merge tuple, exact paths, capability, and expiry; any tuple change blocks patch application;
- result must advance the branch SHA after a committed repair;
- changed paths must be within approved scope and re-run deterministic risk classification;
- newly touched high/protected path without matching approval rejects the repair;
- critical path/action always rejects;
- verification must be revision/workspace stable;
- host calls `evaluateBudgets` before requesting a patch/model response, running the verifier, or pushing; unknown token usage fails closed when a token limit is configured;
- when a token limit is configured, a new run may initialize `tokenUsed` to zero only before any model invocation; resumed runs use persisted provider-reported usage. Missing usage blocks the next model request, and the host records provider-reported input/output usage immediately after each response;
- repeated same-failure and iteration budgets remain enforced.

- [ ] **Step 2: Run tests and verify they fail**

- [ ] **Step 3: Implement the vendor-neutral handshake**

This is intentionally not a model runner. ChatGPT/Codex/another host consumes the sanitized `RepairPacket` and returns a patch proposal only. The trusted host calls `evaluateBudgets` before any model request, parses and normalizes every proposed path, checks it against the exact approved scope and risk policy, rejects unsafe paths before applying anything, and applies the patch with a fixed host-controlled writer. The host checks the current base/head/merge tuple and remaining `LoopState` budgets before invoking the fixed verifier, then derives revision/workspace evidence and changed paths from Git rather than trusting agent claims. Keep App credentials outside the coding agent process. Before push, refresh the full PR tuple, require it to match the verified session, validate the exact non-`main` ref, call `evaluateBudgets`, obtain fresh approval for the verified diff, and use a short-lived repository-scoped Contents-write token. GitHub branch protection remains the server-side guard; the token itself is not branch-scoped.

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
  - `validate-repair --repo owner/name --pr N --patch <path>`
  - `escalation --repo owner/name --pr N`
- Default mode is observe-only.

- [ ] **Step 1: Write failing CLI tests**

Use injected clients/adapters. Assert:
- no network/write happens in `--dry-run`;
- write commands require a verified capability attestation from the host approval provider;
- flags and environment configuration may select credentials but never grant approval;
- authenticated writes require an interactive GitHub App user login plus TTY confirmation; absent TTY or identity forces observe-only mode;
- PR number/repository parsing is strict;
- token values never appear in stdout/stderr;
- every command refreshes the current PR head before actionable write/repair;
- exit codes distinguish ready/wait/escalated/refused/infrastructure error.

- [ ] **Step 2: Run tests and verify they fail**

- [ ] **Step 3: Implement CLI orchestration**

Sequence:
1. load trusted host configuration and obtain the fixed-repository, read-only installation token;
2. fetch the explicitly selected PR snapshot, including the current base/head/merge SHA tuple, and load/reset state scoped to that exact tuple; invalid or stale state fails closed;
3. collect check runs and workflow runs independently for the current head SHA and current merge SHA when present; every observation records `{ baseSha, headSha, mergeSha, testedSha }`, where `testedSha` is exactly head or verified merge. Collect the effective required-check and required-workflow rules, including exact `{ repositoryId, path, ref, sha }` workflow identity, from every applicable policy source. After pagination, refresh the PR tuple; if it changed, discard all collected evidence and restart one bounded collection attempt. Inaccessible workflow sources or partial rule/check pages are `unavailable`/`incomplete`, never empty. Have the trusted adapter compute and supply a SHA-256 failure fingerprint from canonical, bounded failure evidence for each completed failure (excluding volatile delivery/attempt IDs and timestamps); persist normalized observations and tuple-scoped failure counts idempotently by attempt key; then call the Phase 2A decision engine. Phase 2A validates digest format and revision/attempt binding but does not authenticate or recompute the adapter digest. Do not persist raw CI logs;
4. emit/update telemetry;
5. for `rerun-flaky`, evaluate the current host budgets; authenticate the approver with GitHub device flow, verify the allowlist/repository permission, display the exact check/workflow identity and SHA tuple, and require TTY confirmation. Consume approval, refresh/revalidate the tuple, and mint the Actions token. Then atomically reserve a stable action-attempt key and consume one CI-run attempt immediately before POST so network uncertainty cannot bypass the budget or cause a duplicate rerun;
6. let `begin-repair` emit a credential-free `RepairPacket`; before requesting a model/patch response, call `evaluateBudgets` against the host `LoopState`. The coding agent returns a patch proposal without writing to the trusted worktree;
7. in `validate-repair`, refresh and compare the complete base/head/merge tuple, normalize/classify the proposal's path set, obtain and consume `repair:workspace` approval, reject unsafe/out-of-scope paths before applying it, then call `evaluateBudgets`, run the fixed verifier, and derive the final diff from Git;
8. obtain a fresh `contents:write` approval for the verified final diff, mint the capability-specific installation token, call `evaluateBudgets`, and recheck the full PR tuple immediately before push;
9. perform only the explicitly selected allowlisted action and persist compact audit metadata without secrets/raw logs.

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
- rerun only allowlisted workflow/job IDs with a verified no-secrets/no-write PR execution contract;
- refuse runs whose workflow/reusable-workflow definition changed in the PR or whose privilege state is unknown;
- no code repair.

**Stage 2 — repair handshake**
- enable repair packets/sessions on same-repo approved branches;
- coding agent returns a patch proposal; the trusted host applies only validated, path-approved changes, runs verification, and commits;
- host mints a repository-scoped Contents-write token only after path-scoped approval and uses it outside the coding agent process;
- `validate-repair` reauthenticates the approver and obtains a fresh TTY approval after final path validation; no prior approval is reused across commands;
- verify the expected non-`main` ref and head SHA before push, with GitHub branch protection as the server-side guard;
- still no merge.

- [ ] **Step 2: Define promotion metrics**

Before moving Stage 0 -> 1:
- at least 10 representative failed/pending PR observations;
- trusted approval verification and the workflow/job allowlist are implemented and reviewed;
- eligible PR jobs have no secrets, protected environments, or write-capable token;
- 0 stale-SHA actionable decisions;
- 0 protected/infrastructure cases misclassified as branch-caused;
- telemetry contains no secrets/raw review bodies.

Before moving Stage 1 -> 2:
- at least 10 bounded rerun decisions or sufficient representative fixtures if real flaky failures are rare;
- no retry-budget overruns;
- no duplicate reruns;
- operator understands that the host token is repository-scoped and permission-scoped but not branch-scoped, and that server-side branch protection guards protected refs.

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
- PR-modified workflow and secret-bearing job rerun refusal;
- forged/expired/wrong-scope approval refusal;
- incomplete required-check policy and partial check collection;
- required workflow identity exact-match cases for `{ repositoryId, path, ref, sha }`, including missing source fields, inaccessible source repo, duplicate run evidence, and pending/success/failure/unavailable outcomes;
- current head-tested and current merge-tested results, unrelated `testedSha`, base advancement, merge SHA refresh, and a PR tuple change during pagination;
- hostile job-log redirect receives no GitHub authorization;
- stale head during rerun;
- stale base or merge tuple invalidates approval and aborts rerun, repair, verification, and push;
- flaky check within/exhausted budget;
- infrastructure error;
- fork PR;
- protected-path failure;
- branch-caused repair request;
- repair result touching newly protected path;
- token/rate-limit error;
- configured token limit with unknown usage fails closed before a model call;
- token usage is initialized to zero only for a fresh run before any model call, persisted provider usage gates subsequent calls, and missing post-call usage blocks the next call;
- wall-clock budget immediately below, at, and beyond the limit blocks model/rerun/verifier/push actions before execution;
- CI-run budget immediately below, at, and beyond the limit, including a timed-out POST whose attempt was already persisted;
- duplicate delivery/retry.

- [ ] **Step 3: Execute Stage 0 against a real non-production PR**

Observe only. Confirm normalized required-check/workflow identities and observations tested on the current head or merge SHA, plus the full base/head/merge tuple and decisions, match GitHub UI. Do not enable write permissions.

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
- Required workflow source identity `{ repositoryId, path, ref, sha }` remains distinct from the PR commit `testedSha`; missing or inaccessible source evidence fails closed.
- Phase 2B CI reruns use a finite host-owned `LoopState` budget and an atomic idempotency reservation before the GitHub POST.
- Model/vendor execution is deliberately externalized behind a structured repair handshake.
- Playwright remains deferred in line with current repository history and YAGNI.
