# Loop Engineering

Loop Engineering is a bounded, auditable control plane around coding work—not an autonomous production operator. The Phase 1 foundation supplies local policy loading, deterministic path/action risk classification, compact state, verification planning, failure classification, and a bounded state machine.

## Control-plane placement

The Stage 1 recovery workflow denies cache restore/save with workflow-wide
`cache-mode: none`. Its verifier executes PR code in a `main` dispatch, so a
read-only GitHub token is insufficient: the separate cache token must also be
restricted to prevent default-branch cache poisoning. Normal PR CI and the
live recovery pilot are distinct evidence; see the
[readiness guide](../../docs/loop-engineering/stage1-readiness.md).

- `scripts/loop/` owns the implementation: policy, risk classifier, state/budgets, verification runner, failure classifier, and controller.
- `scripts/loop/hosted/cloudflare/` contains Hosted Stage 0: signed webhook ingress, repository-scoped GitHub App observation, D1 idempotency/state, Queue processing, scheduled open-PR reconciliation, and a separate report-only Check Run capability.
- `.agent/policy/` owns versioned path, action, and stop-condition policy; an agent must not silently weaken it during an active run.
- `.agent/loops/` describes the feature inner loop and the future PR babysitter contract.
- `.loop/state/<task-id>.json` and `.loop/pr/` are local, gitignored metadata. They store stable IDs, hashes, counters, statuses, and failure fingerprints—not prompts or customer data.
- Stage 1's per-PR CI budget session is stored under the OS-resolved user home in `.loop/state/`. The host canonicalizes the home and checkout paths for every budget operation and refuses a checkout containing that store, so checkout-local state cannot become the authoritative counter. This remains user-local storage, not an OS sandbox against other processes running as that user.
- `AGENTS.md` remains the repository operating contract; this Wiki page explains why these boundaries exist.

## Safety boundaries

Hosted Stage 0 uses `redirect: 'manual'` for authenticated GitHub transport and rejects 3xx responses explicitly. Workers reject `redirect: 'error'` before network I/O, so that setting can produce a misleading reconciliation network-error code. Production deployments belong to the protected GitHub Actions workflow; disable competing Workers Builds deployments to prevent storefront code from replacing Stage 0 handlers, bindings, and secrets. See the [operations runbook](../../docs/loop-engineering/hosted-stage0-runbook.md).

- Risk is classified before writes; high/critical policy globs match case-insensitively to avoid filesystem casing aliases. Phase 1 has no trusted approval provider, so caller-supplied scope/timestamp metadata cannot authorize high-risk work; it always escalates. Critical paths and actions never enter implementation.
- The Phase 1 controller is state-only, not a write capability; its policy/path/verification context is caller input, not an authenticated attestation. The Stage 0 host loads canonical policy from the PR base commit and provides read-only observation only. Any future write-capable host must derive changed paths, invoke the fixed verifier itself, independently observe completion evidence, authenticate approval, and constrain actual writes to that exact set.
- The runner reads Git HEAD and fingerprints the index plus changed tracked/untracked files before and after checks; the controller reaches `done` only if both snapshots and the host-observed completion fingerprint match, alongside matching verifier/host Git revisions and `LoopState.headSha`. The fingerprint excludes ignored dependencies/caches and cannot detect transient edits restored before the final sample, so local green results are provisional, not authenticated attestations. Clean-checkout hosted CI and required external checks remain mandatory before handoff. Retries are bounded, and only a relevant current-revision branch-caused failure may enter repair.
- A full result remains incomplete while required external checks have not run. Infrastructure, stale, protected, and ambiguous failures escalate instead of triggering product-code edits.
- The runner uses a fixed command registry and a sanitized child environment, refuses real dotenv files and project npm authentication settings, and is defense-in-depth rather than an OS sandbox.
- Phase 1 makes no GitHub writes: it does not dispatch issues, update/comment on PRs, push, or merge. Production database mutation, migration/reset, and deployment promotion are outside the loop; merge and production operations remain human-controlled.

## Phase 2 authentication design

The PR babysitter uses a dedicated GitHub App; it does not reuse the Codex `@GitHub` connector credentials. GitHub authenticates the human approver through the App's user authorization flow, while a short-lived installation token gives the trusted host its API identity. [GitHub distinguishes App, installation, and user authentication](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/about-authentication-with-a-github-app).

- Stage 0 uses only a repository-scoped installation token with read permissions; it does not run maintainer device flow. Future Stage 1/2 host actions use the App's device flow and check the signed-in GitHub user ID against a trusted host allowlist. Login identifies the approver but does not approve an action; a TTY confirmation must bind the repository, PR, current SHA tuple, capability, exact paths, and expiry. The coding agent proposes a patch without direct worktree access; the trusted host checks paths before applying it under `repair:workspace` approval, then requires a fresh `contents:write` approval after verification and before pushing.
- Installation tokens are scoped to the target repository and to the minimum permission set for one capability. Stage 0 keeps its read-only `observe` scope. Stage 1 source verification uses a separate `source-attestation:read` token that adds only repository `Attestations: read`; the installed App must grant that permission. Reruns and repair require separate Actions-write and Contents-write scopes. Keep the App private key outside the checkout, and never persist OAuth or installation tokens. [GitHub supports repository- and permission-scoped installation tokens](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app).
- GitHub records API writes under the App identity; the Loop audit metadata records the authenticated approver ID separately. Repair push approval is requested after validating the final changed paths and is consumed in the same process, so approval credentials do not travel in a `RepairPacket` or `.loop/state/`.
- `scripts/loop/github-auth-provider.mjs` implements App device flow, resolves the principal from `/user`, checks the host-owned numeric user-ID allowlist, requests repository-scoped capability tokens, and issues opaque, single-use TTY approvals. Actions rerun approval binds the PR SHA tuple, tested SHA, exact required identity, workflow run/attempt, failed job IDs, and path scope. `scripts/loop/github-pr-client.mjs` implements fixed-origin, read-only PR/check/ruleset/workflow/review reads, complete changed-file evidence, and bounded redacted job-log reads. `scripts/loop/pr-babysitter-host.mjs` assembles the fixed-repository Stage 0 entrypoint, pins policy to the PR base commit, verifies a clean checkout at the PR head, and exposes only `inspect` with an `observe` installation token; when Stage 1 attaches source verification, the verifier receives a separate `source-attestation:read` token.
- `scripts/loop/github-actions-write.mjs` exposes only the job-specific rerun endpoint and accepts exactly one approved root job ID from complete evidence for the selected workflow attempt. It requires a fresh same-repository PR tuple, complete PR-file/run/job evidence, a trusted workflow/job allowlist, a finite `LoopState` CI-run budget, and exact one-use approval before minting the Actions-write token. It reserves the stable attempt key before POST; uncertain network outcomes remain consumed. Multiple requested roots or multiple failed roots are refused before approval or budget reservation. The host allowlist pins stable job names while each approval pins the observed per-run job ID and attempt.
- The reviewed Stage 1 recovery design replaces that older rerun path with an exact Check Run recovery flow: the host selects one failed `client`/`server` check from App `15368`, approves the full PR tuple and trusted workflow/actor identity once, reserves the CI budget, then dispatches only the fixed `stage1-trusted-retry.yml` workflow on `main`. The verifier job runs the shared fixed CI action against the approved SHA with read-only permissions. A separate publisher job can PATCH only the original Check Run after verifier success and does not checkout or execute PR code. The read-only observer polls only the returned workflow run ID and rechecks the current tuple, policy, required checks, source SHA, actor, and both job results. Mock/static tests do not prove GitHub's cross-run Check Run update or branch-protection behavior.
- The OIDC source-attestation path builds a deterministic descriptor for one workflow run attempt, verifies the GitHub certificate through `gh attestation verify`, and creates a private verifier-owned record. The read adapter and guarded rerun writer ignore caller-supplied `sourceSha` and `sourceShaAttested` fields; only that record can carry the exact source `{ repositoryId, path, ref, sha }`. Required-workflow source repository IDs may differ from the PR repository, but the exact identity must match trusted host configuration and a host-provided attestation. The verifier requires the attested workflow to belong to the observed repository. Stage 1 `inspect` now configures this verifier, and PR #300 proves the hosted producer-to-probe path for one current tuple; neither result supplies a live host record or enables reruns. `runPrBabysitterCli` remains the host-injected API; `runPrBabysitterStage0` is the standalone read-only entrypoint and cannot rerun, repair, push, or merge.
- `scripts/loop/repair-session.mjs` provides a vendor-neutral repair handshake. A trusted host creates a sanitized session bound to the current PR SHA tuple, tested SHA, workspace fingerprint, exact allowed paths, failure evidence, and validated `LoopState` budgets. It accepts only a bounded JSON write/delete proposal, consumes the exact `repair:workspace` approval, checks paths before writing, rechecks the PR tuple immediately before the write, commits locally, and runs the fixed verifier only after a fresh budget check. If the verifier budget expires after commit, the host persists the committed SHA to `LoopState` without claiming verification or consuming an iteration. This module does not run a model or push to GitHub; the separate PR Babysitter orchestration requires fresh `contents:write` approval and budget checks before token minting and immediately before push.
- Required workflow rules identify `{ repository_id, path, ref, sha }`, where `sha` is the workflow source revision. The opt-in producer runs only for a labeled, open, same-repository PR and does not check out or execute PR code. Its descriptor binds repository/workflow IDs, path/ref, run ID/attempt, tested SHA, and the full PR tuple. The downstream `workflow_run` probe reads the exact run and one current same-repository PR, then reports only a certificate-backed `sourceShaCandidate`; that output is feasibility metadata, not a trusted record or green required-workflow result. Raw `workflow_sha` fields and statement predicates never establish identity. Require the later hosted proof, including a source SHA different from the tested SHA, before treating the attestation path as proven. See [required workflow rules](https://docs.github.com/en/enterprise-cloud@latest/rest/repos/rules?apiVersion=2026-03-10), [workflow runs](https://docs.github.com/en/rest/actions/workflow-runs), and the [Stage 1 runbook](../../docs/loop-engineering/stage1-cli-runbook.md).

## Phase 2A PR Babysitter core

- The GitHub-agnostic core is implemented in `scripts/loop/`. It returns one
  action (`wait`, `retry-check`, `request-repair`, `escalate`, or
  `ready-for-human`) and cannot make GitHub writes or edit product code.
- PR evidence and schema-v3 state bind to the current head/base/merge SHA tuple.
  Each check also records `testedSha`, which must equal the current head or
  merge SHA. Required workflows are separate evidence identities containing
  repository ID, workflow path, ref, and source SHA. Missing, duplicate,
  stale, partial, or unavailable evidence cannot be treated as green. Stage 0
  reports bounded required-check coverage and observations separately for the
  current head and merge SHA; those diagnostics do not change the fail-closed
  decision.
- When branch protection returns the same context in fine-grained `checks` and
  legacy `contexts`, keep the `checks` identity, including its App ID, once.
  Preserve context-only legacy checks that have no matching fine-grained entry.
- State rolls to a new tuple only after reconciliation with a fresh snapshot for
  the same repository and PR. A stale check observation cannot roll state back
  or reset tuple-scoped retries and failure counts.
- Completed `neutral` and `skipped` checks are green. Required policy is empty
  only when the host has completely collected and fingerprinted the effective
  rules; inaccessible workflow sources remain unavailable.
- Phase 2A counts same-failure attempts and flaky retries at PR scope. The
  trusted Phase 2B host owns run-local budgets through `LoopState` for wall-clock,
  token use, and CI runs. Unknown token usage blocks another model call when a
  token limit is configured.
- Escalation and repair packets expose bounded sanitized metadata and fixed
  verifier command IDs. Telemetry stores stable identifiers and numeric
  counters, never prompt bodies, review text, credentials, signed URLs, or raw
  CI logs.

## Hosted diagnostics

On 2026-10-09, the hosted source probe and Worker consumer gained bounded reason codes without changing authorization, candidate eligibility, decisions, or retry behavior. Unavailable probe results carry a fixed `reasonCode`; path metadata is the canonical workflow path only when it matches exactly. Worker failures carry a fixed processing `stage` and allowlisted `reasonCode`; unknown errors become `stage0_<stage>_failed`. Invalid PR/check normalization has fixed typed codes. Incomplete policy or check evidence retains its existing wait/unavailable behavior. These diagnostics locate a boundary but do not establish a root cause or prove successful consumer processing.

The 2026-10-09 read-only D1 sample contained 258 historical retry records with `stage0_queue_processing_failed`, no PR-state rows, and no Check Run mappings. It is not current-backlog evidence, root-cause proof, or pilot evidence. The scheduler's `last_completed_at` value proves only that a sweep completed. The active Worker version uploaded on 2026-10-06 has no commit-SHA attestation. The GitHub workflow-source probe requires a reviewed merge and a fresh eligible PR observation because `workflow_run` uses default-branch code; that probe does not depend on a Cloudflare deployment. Worker diagnostics separately require a protected deployment with source-commit and active-version correlation. One later PR may exercise both paths. Stage 1 remains blocked pending that evidence and its independent readiness gates. See the [hosted runbook](../../docs/loop-engineering/hosted-stage0-runbook.md) and [readiness evidence](../../docs/loop-engineering/stage1-readiness.md).

## Rollout boundary

The Autonomous Issue-to-Merge work is tracked separately in
`docs/superpowers/plans/2026-10-13-autonomous-issue-to-merge.md`. The
`feature/autonomous-task-lifecycle` branch adds a strict TaskRecord v2 contract
and reducer, an additive D1 task table, validated persistence with optimistic
version updates, and expiring owner-bound execution leases. The current slice
also adds signed Issue webhook routing, canonical autonomy policy loading at
the default branch's immutable commit SHA, a fail-closed authorizer/task
factory, idempotent D1 task creation, and a separate metadata-only task Queue
producer. Tasks 3–7 now add a pinned no-network Docker runner, a lease-bound
host runtime, exact-path patch and delivery gates, CI/merge evidence checks,
bounded reconciliation, and a one-use completion proof. The production Queue
consumer and runner service binding are still unprovisioned, and automatic
worktree resume, live CI rerun/repair, native merge writing, and Issue completion
comments remain unimplemented. The current host's Codex workspace-write
sandbox allows reads outside its worktree, so it is not an acceptable
unattended boundary for untrusted Issue text; see
[task-runner.md](../../docs/loop-engineering/task-runner.md). Autonomy and
auto-merge remain disabled.

Hosted Stage 0 has a Cloudflare Worker implementation with mocked API/D1/Queue tests and fixed-verifier coverage. The D1 database, Queues, Worker bindings, public IDs, and required secret names were observed as configured on 2026-10-09; secret values were not read. The active Worker version still lacks verified source-commit provenance, and live PR pilot completion is unproved. Its Check Run report is always `neutral`, bounded, attached to the revalidated head SHA, and explicitly non-gating. PR and main-push validation runs without Cloudflare/App secrets; only a manual `workflow_dispatch` from `main` can enter the protected production deployment job. See [[0007-hosted-stage0-report-check]] and the [hosted runbook](../../docs/loop-engineering/hosted-stage0-runbook.md).

The Phase 2A decision core and the Phase 2B GitHub App auth, observation
adapter, worktree guard, guarded Actions rerun, repair session, and
`runPrBabysitterCli` orchestration function are implemented. The worktree guard
verifies the local same-repository feature branch and HEAD against the PR,
reloads persisted PR and LoopState records, and captures a stable workspace
fingerprint. Dirty worktrees require the trusted host's task identity and a
matching persisted fingerprint. Before consuming repair approval, the guard
refreshes the full PR SHA tuple; later repair stages repeat that check through
the trusted snapshot refresher.

The Stage 0 trusted-host bootstrap and standalone `inspect` entrypoint are
implemented. The first live observation ran against PR #264 on 2026-09-30 and
returned `wait` because required check evidence was missing from the selected
merge-SHA collection. The original output did not expose the head-SHA
collection; the per-SHA diagnostic summary now reports both without weakening
the decision gate. The entrypoint rejects write-capable commands before
loading credentials or contacting GitHub; it mints only a repository-scoped
`observe` token and writes bounded state under `.loop/pr/`. Stage 1 attaches
the optional OIDC verifier and mints a separate `source-attestation:read`
token, but this remains subject to the installed App permission and live host
configuration. GitHub run metadata alone does not attest its source SHA.
Stage 1/2 write orchestration still needs a separately
reviewed trusted host that rechecks the PR tuple, commit, workspace
fingerprint, final diff, and budget before minting a `contents:write` token,
then rechecks the budget immediately before push. Tokens are repository-scoped
and permission-scoped, not branch-scoped; GitHub branch protection guards
protected refs. Phase 2B has no merge authority, issue-to-Draft-PR dispatch, or
post-merge observation. See [[architecture]] and [[index]].

The Stage 1 CLI remains fail-closed. `inspect` delegates to the read-only host
with the source verifier attached. `initialize-budget` creates one local
LoopState session after typed TTY confirmation and binds it to the current PR
base/head tuple and canonical limits. `rerun-flaky` connects exact flaky
evidence, trusted approver confirmation, post-approval tuple checks, budget
reservation, a fixed `workflow_dispatch`, OIDC source verification, and an
observer for the returned run ID. The user-local trust file is the only source
of numeric approver and workflow actor IDs; env and CLI inputs cannot override
them. The workflow supports only `client` and `server` checks from App `15368`,
and the publisher transport permits fixed reads plus one success PATCH to the
original failed Check Run.

The GitHub Check Runs reader requests the complete run history with
`filter=all`; GitHub otherwise returns only the latest run for each check.
It may bind `previouslyPassedRevision` to a failure only when each run has
exactly one raw PR association matching the fresh snapshot's PR number,
base/head repository IDs, refs, and SHAs; both runs also share the required
context/App identity, provider, tested SHA, and Check Suite ID. Each completed
interval must have valid timestamps, and the runs must form a unique, strictly
ordered, non-overlapping sequence. Fresh before-and-after PR snapshots must
agree on the current base/head/merge tuple, which binds the observations to
its current merge SHA. Historical Check Run API records do not independently
supply a merge SHA. Missing or ambiguous evidence leaves the failure
unclassified as flaky. The Check Run remains outside verifier-confirmed
changed scope; this history signal does not authorize repair. See [GitHub
Check Runs API](https://docs.github.com/en/rest/checks/runs?apiVersion=latest).

Before that PATCH, the publisher independently reloads complete branch
protection/ruleset policy, compares its fingerprint with the approved target,
and requires exactly one matching context/App ID. Missing, changed, ambiguous,
or inaccessible policy refuses publication. The read-only transport uses a
separate App installation token, while the Actions token transport permits
only the existing exact Check Run PATCH. The SHA-pinned official token action
mints the reader only in the trusted publisher's `stage1-policy-reader`
environment, scopes it to this repository, requests read permissions, and
revokes it after the job. Missing/reused tokens refuse before dispatch-event
parsing. The reader App, protected environment, runner permissions, local
trust configuration, and CLI were configured by 2026-10-12. This does not
prove the hosted cross-run Check Run update or count as a recovery pilot. See
the [Stage 1 CLI runbook](../../docs/loop-engineering/stage1-cli-runbook.md).

After review and merge, operators launch this CLI from a clean reviewed
`main` checkout while keeping the selected PR worktree as the process current
directory. This keeps executable host modules on the trusted revision while
the host derives the target SHA and `.loop/pr/` observation state from the PR
checkout. Stage 1's finite CI budget is stored under the OS-resolved user home;
the host fails closed if that effective store path overlaps the PR checkout.
The local trust loader resolves its fixed config path from
`os.userInfo().homedir`; it ignores `USERPROFILE` and fails closed if OS home
resolution is unavailable or invalid.

PR #304 merged the trusted Stage 1 dispatch implementation to `main` at
`875eb82e0886edd622737136eb6a8f5fbbd313ae`. This is implementation status,
not an established human review record or operational evidence. A formal
GitHub PR approval is subject to the restriction that the PR author cannot
approve their own PR. That review record is separate from the trusted host's
one-use TTY maintainer approval and exact operation-scope consent. At the
2026-10-13 connected GitHub read-only snapshot, PR #309 was green and supplied
no failed/pending observation. PR #310's
`SYNTHETIC_STAGE1_DRILL` passed on attempt 1 and failed on attempt 2 at the same
SHA; it is not a natural flaky observation and counts zero toward Stage 0
promotion or live recovery. The two examined open candidates yielded no new
qualifying observations and zero eligible pilots; prior readiness records
were not recounted, so this is not a global historical total. PR and run
observations came from the connected GitHub read-only source. GitHub CLI
authentication succeeds outside the sandbox as `memories-quy-2002`; sandbox
credential errors reflect Windows credential-store availability. OAuth CLI
authentication does not establish GitHub App permissions.

Keep rollout milestones separate. Stage 0-to-Stage 1 pilot authorization
requires ten representative failed or pending Stage 0 PR observations (not
necessarily ten flakes), the classification/hosted-evidence safeguards, the
required human review record, trusted-main and App/local trust prerequisites, and
a per-PR budget. A natural `same_revision_pass_then_fail` is specifically
required for the selected live recovery. Only after authorization may the
maintainer approve one exact recovery in a real TTY; its returned run, verified
source attestation, allowlisted jobs, unchanged policy/tuple, original Check
Run update, and budget outcome must all be observed to call the pilot
complete. Stage 1-to-Stage 2 rerun-decision criteria are later and deferred.

No live recovery dispatch, host source-attestation proof, or original Check Run
PATCH has been observed. On 2026-10-13, Node 24.20.0 was installed but not on
`PATH`; the user-local trust file had expected shape but identity correctness
was unverified; the four `LOOP_GITHUB_APP_*` variables and local Stage 1 budget
directory were absent. Fresh connected GitHub evidence shows Stage 0 run
`37875125233` cancelled at `03:39:56Z`, Stage 0 push `38216754911` successful
at `03:40:26Z` on `875eb82e0886edd622737136eb6a8f5fbbd313ae`, and old CI
`35555634277` cancelled at `03:44:55Z`. Current CI `38216754992` began at
`03:44:57Z` on the same SHA; client/server succeeded, while `production-migrate`
waits for the Production environment reviewer. The old run shared the main CI
concurrency group and its cancellation preceded the new run, but direct lock
evidence was unavailable through the adapter. The Stage 0 run uses a separate
group. No Production approval was made by the agent.

The latest fixed Loop Foundation run in the actual linked source worktree
passed 409/409 tests across 31 suites using Node 24.20.0 with test concurrency
1; three workflow dry-run routing checks and `git diff --check` passed. One
intervening full 35-file run passed 408/409 because the unchanged nested
`repair-session` verifier exited nonzero; its focused test file then passed
12/12, and the subsequent full run passed. The nested failure was intermittent
and its output was not captured, so no root cause is established. These
results are provisional; hosted validation and live recovery remain unproven.
Readiness
documentation passed specification and quality review and remains a local
change pending hosted validation. See the [Stage 1 CLI runbook](../../docs/loop-engineering/stage1-cli-runbook.md)
and [readiness evidence](../../docs/loop-engineering/stage1-readiness.md).

## Autonomous Issue-to-Merge status

The implementation plan and source now cover signed Issue ingress, digest-only TaskRecord/D1 state and leases, Queue dispatch handling, a pinned no-network Docker runner, a lease-bound host runtime, exact-scope PR delivery, evidence-driven CI/merge gates, bounded reconciliation, and a one-use completion proof. The completion reducer refuses `completed` unless the host freshly verifies merged PR identity/SHA, full verification, required checks, and attested workflow sources. The runtime checks the Issue digest and eligibility before dispatch acceptance and rechecks before model or delivery writes. Dirty canonical policy checkouts fail closed.

This branch is still local implementation evidence. The canonical autonomy policy remains disabled and does not grant auto-merge. Automatic worktree resume, live CI rerun/repair executors, native merge writing, Issue completion-comment writing, and production Worker-to-host binding are not implemented. No OpenAI API call, GitHub write, push, merge, or deployment has been performed. See the [task runner guide](../../docs/loop-engineering/task-runner.md) and [implementation plan](../../docs/superpowers/plans/2026-10-13-autonomous-issue-to-merge.md).
