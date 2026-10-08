# Loop Engineering

Loop Engineering is a bounded, auditable control plane around coding work—not an autonomous production operator. The Phase 1 foundation supplies local policy loading, deterministic path/action risk classification, compact state, verification planning, failure classification, and a bounded state machine.

## Control-plane placement

- `scripts/loop/` owns the implementation: policy, risk classifier, state/budgets, verification runner, failure classifier, and controller.
- `scripts/loop/hosted/cloudflare/` contains Hosted Stage 0: signed webhook ingress, repository-scoped GitHub App observation, D1 idempotency/state, Queue processing, scheduled open-PR reconciliation, and a separate report-only Check Run capability.
- `.agent/policy/` owns versioned path, action, and stop-condition policy; an agent must not silently weaken it during an active run.
- `.agent/loops/` describes the feature inner loop and the future PR babysitter contract.
- `.loop/state/<task-id>.json` and `.loop/pr/` are local, gitignored metadata. They store stable IDs, hashes, counters, statuses, and failure fingerprints—not prompts or customer data.
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
- Installation tokens are scoped to the target repository and to the minimum permission set for one capability. Stage 0 is read-only; reruns and repair require separate Actions-write and Contents-write scopes. Keep the App private key outside the checkout, and never persist OAuth or installation tokens. [GitHub supports repository- and permission-scoped installation tokens](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app).
- GitHub records API writes under the App identity; the Loop audit metadata records the authenticated approver ID separately. Repair push approval is requested after validating the final changed paths and is consumed in the same process, so approval credentials do not travel in a `RepairPacket` or `.loop/state/`.
- `scripts/loop/github-auth-provider.mjs` implements App device flow, resolves the principal from `/user`, checks the host-owned numeric user-ID allowlist, requests repository-scoped capability tokens, and issues opaque, single-use TTY approvals. Actions rerun approval binds the PR SHA tuple, tested SHA, exact required identity, workflow run/attempt, failed job IDs, and path scope. `scripts/loop/github-pr-client.mjs` implements fixed-origin, read-only PR/check/ruleset/workflow/review reads, complete changed-file evidence, and bounded redacted job-log reads. `scripts/loop/pr-babysitter-host.mjs` assembles the fixed-repository Stage 0 entrypoint, pins policy to the PR base commit, verifies a clean checkout at the PR head, and exposes only `inspect` with an `observe` installation token.
- `scripts/loop/github-actions-write.mjs` exposes only the job-specific rerun endpoint and accepts exactly one approved root job ID from complete evidence for the selected workflow attempt. It requires a fresh same-repository PR tuple, complete PR-file/run/job evidence, a trusted workflow/job allowlist, a finite `LoopState` CI-run budget, and exact one-use approval before minting the Actions-write token. It reserves the stable attempt key before POST; uncertain network outcomes remain consumed. Multiple requested roots or multiple failed roots are refused before approval or budget reservation. The host allowlist pins stable job names while each approval pins the observed per-run job ID and attempt.
- The OIDC source-attestation path builds a deterministic descriptor for one workflow run attempt, verifies the GitHub certificate through `gh attestation verify`, and creates a private verifier-owned record. The read adapter and guarded rerun writer ignore caller-supplied `sourceSha` and `sourceShaAttested` fields; only that record can carry the exact source `{ repositoryId, path, ref, sha }`. Required-workflow source repository IDs may differ from the PR repository, but the exact identity must match trusted host configuration and a host-provided attestation. The standard GitHub run adapter has no source-SHA attestation, so required-workflow evidence remains unavailable until a trusted provider is wired. The verifier requires the attested workflow to belong to the observed repository. Stage 1's host does not configure this provider, and hosted producer-to-probe proof remains pending. `runPrBabysitterCli` remains the host-injected API; `runPrBabysitterStage0` is the standalone read-only entrypoint and cannot rerun, repair, push, or merge.
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

## Rollout boundary

Hosted Stage 0 now has a Cloudflare Worker implementation with mocked API/D1/Queue tests and fixed-verifier coverage. Its Check Run report is always `neutral`, bounded, attached to the revalidated head SHA, and explicitly non-gating. PR and main-push validation runs without Cloudflare/App secrets; only a manual `workflow_dispatch` from `main` can enter the protected production deployment job. The Cloudflare resources, secrets, webhook, deployment, and live pilot have not been configured or run; each remains behind the Task 8 approval gate. See [[0007-hosted-stage0-report-check]] and the [hosted runbook](../../docs/loop-engineering/hosted-stage0-runbook.md).

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
`observe` token and writes bounded state under `.loop/pr/`. The Stage 0
entrypoint does not configure the optional OIDC verifier, so required workflow
evidence remains unavailable; GitHub run metadata alone does not attest its
source SHA. Stage 1/2 orchestration still needs a separately
reviewed trusted host that rechecks the PR tuple, commit, workspace
fingerprint, final diff, and budget before minting a `contents:write` token,
then rechecks the budget immediately before push. Tokens are repository-scoped
and permission-scoped, not branch-scoped; GitHub branch protection guards
protected refs. Phase 2B has no merge authority, issue-to-Draft-PR dispatch, or
post-merge observation. See [[architecture]] and [[index]].

The Stage 1 CLI work remains fail-closed: `inspect` delegates to the Stage 0
read-only host, while live `rerun-flaky` refuses before credentials or network
access. The branch for PR #293 adds the workflow-source producer, certificate
verifier, read-only probe, and verifier-owned adapter gates, but the Stage 1
host does not configure them and hosted proof is pending. PR #296 merged the
attempt-bound single-job writer, but the standalone host still reports
`run_attempt_write_binding_unavailable` until its capability gate is reconciled
with that writer. A complete workflow/job allowlist, trusted approver
configuration, and host-managed LoopState CI budget session also remain absent.
PR #289 set `ciRunLimit` to 2; that does not enable reruns because the host does
not bind a persisted budget session to the policy revision. Dry-run validates
syntax only. See the [Stage 1 CLI
runbook](../../docs/loop-engineering/stage1-cli-runbook.md) and [readiness
evidence](../../docs/loop-engineering/stage1-readiness.md).
The read adapter binds job evidence to GitHub's exact workflow run attempt and
marks missing attempt IDs incomplete. PR #296 merged a guarded writer that
rechecks the attempt after budget reservation and posts only the approved job
ID. A controlled test on non-main PR #294 observed that GitHub rejects a
previous-attempt job ID with `403` once a newer attempt is current. This
evidence does not verify the dependent-job closure: that graph, hosted source
attestation, trusted approver, host wiring, and host-managed budget session
remain Stage 1 activation gates.
