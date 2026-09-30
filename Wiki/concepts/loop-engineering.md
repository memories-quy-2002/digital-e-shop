# Loop Engineering

Loop Engineering is a bounded, auditable control plane around coding work—not an autonomous production operator. The Phase 1 foundation supplies local policy loading, deterministic path/action risk classification, compact state, verification planning, failure classification, and a bounded state machine.

## Control-plane placement

- `scripts/loop/` owns the implementation: policy, risk classifier, state/budgets, verification runner, failure classifier, and controller.
- `.agent/policy/` owns versioned path, action, and stop-condition policy; an agent must not silently weaken it during an active run.
- `.agent/loops/` describes the feature inner loop and the future PR babysitter contract.
- `.loop/state/<task-id>.json` is local, gitignored metadata. It stores stable IDs, hashes, counters, statuses, and failure fingerprints—not prompts or customer data.
- `AGENTS.md` remains the repository operating contract; this Wiki page explains why these boundaries exist.

## Safety boundaries

- Risk is classified before writes; high/critical policy globs match case-insensitively to avoid filesystem casing aliases. Phase 1 has no trusted approval provider, so caller-supplied scope/timestamp metadata cannot authorize high-risk work; it always escalates. Critical paths and actions never enter implementation.
- The Phase 1 controller is state-only, not a write capability; its policy/path/verification context is caller input, not an authenticated attestation. A future host adapter must load canonical policy, derive changed paths, invoke the fixed verifier itself, independently observe completion evidence, authenticate approval, and constrain actual writes to that exact set.
- The runner reads Git HEAD and fingerprints the index plus changed tracked/untracked files before and after checks; the controller reaches `done` only if both snapshots and the host-observed completion fingerprint match, alongside matching verifier/host Git revisions and `LoopState.headSha`. The fingerprint excludes ignored dependencies/caches and cannot detect transient edits restored before the final sample, so local green results are provisional, not authenticated attestations. Clean-checkout hosted CI and required external checks remain mandatory before handoff. Retries are bounded, and only a relevant current-revision branch-caused failure may enter repair.
- A full result remains incomplete while required external checks have not run. Infrastructure, stale, protected, and ambiguous failures escalate instead of triggering product-code edits.
- The runner uses a fixed command registry and a sanitized child environment, refuses real dotenv files and project npm authentication settings, and is defense-in-depth rather than an OS sandbox.
- Phase 1 makes no GitHub writes: it does not dispatch issues, update/comment on PRs, push, or merge. Production database mutation, migration/reset, and deployment promotion are outside the loop; merge and production operations remain human-controlled.

## Phase 2 authentication design

The PR babysitter uses a dedicated GitHub App; it does not reuse the Codex `@GitHub` connector credentials. GitHub authenticates the human approver through the App's user authorization flow, while a short-lived installation token gives the trusted host its API identity. [GitHub distinguishes App, installation, and user authentication](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/about-authentication-with-a-github-app).

- The host-injected entry function uses the App's device flow and checks the signed-in GitHub user ID against a trusted host allowlist. Login identifies the approver but does not approve an action; a TTY confirmation must bind the repository, PR, current SHA tuple, capability, exact paths, and expiry. The coding agent proposes a patch without direct worktree access; the trusted host checks paths before applying it under `repair:workspace` approval, then requires a fresh `contents:write` approval after verification and before pushing.
- Installation tokens are scoped to the target repository and to the minimum permission set for one capability. Stage 0 is read-only; reruns and repair require separate Actions-write and Contents-write scopes. Keep the App private key outside the checkout, and never persist OAuth or installation tokens. [GitHub supports repository- and permission-scoped installation tokens](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app).
- GitHub records API writes under the App identity; the Loop audit metadata records the authenticated approver ID separately. Repair push approval is requested after validating the final changed paths and is consumed in the same process, so approval credentials do not travel in a `RepairPacket` or `.loop/state/`.
- `scripts/loop/github-auth-provider.mjs` implements App device flow, resolves the principal from `/user`, checks the host-owned numeric user-ID allowlist, requests repository-scoped capability tokens, and issues opaque, single-use TTY approvals. Actions rerun approval binds the PR SHA tuple, tested SHA, exact required identity, workflow run/attempt, failed job IDs, and path scope. `scripts/loop/github-pr-client.mjs` implements fixed-origin, read-only PR/check/ruleset/workflow/review reads, complete changed-file evidence, and bounded redacted job-log reads.
- `scripts/loop/github-actions-write.mjs` exposes only the failed-jobs rerun endpoint. It requires a fresh same-repository PR tuple, complete PR-file/run/job evidence, a trusted workflow/job allowlist, a finite `LoopState` CI-run budget, and exact one-use approval before minting the Actions-write token. It reserves the stable attempt key before POST; uncertain network outcomes remain consumed. The host allowlist pins stable job names while each approval pins the observed per-run job IDs and attempt.
- Required-workflow source repository IDs may differ from the PR repository, but the exact source `{ repositoryId, path, ref, sha }` must match trusted host configuration and a host-provided attestation. The standard GitHub run adapter has no source-SHA attestation, so it continues to report required-workflow evidence unavailable and actual reruns remain fail-closed until a trusted attestation source is wired. `runPrBabysitterCli` is an exported host-injected function, not a standalone command; this repository does not assemble a trusted host.
- `scripts/loop/repair-session.mjs` provides a vendor-neutral repair handshake. A trusted host creates a sanitized session bound to the current PR SHA tuple, tested SHA, workspace fingerprint, exact allowed paths, failure evidence, and validated `LoopState` budgets. It accepts only a bounded JSON write/delete proposal, consumes the exact `repair:workspace` approval, checks paths before writing, rechecks the PR tuple immediately before the write, commits locally, and runs the fixed verifier only after a fresh budget check. If the verifier budget expires after commit, the host persists the committed SHA to `LoopState` without claiming verification or consuming an iteration. This module does not run a model or push to GitHub; the separate PR Babysitter orchestration requires fresh `contents:write` approval and budget checks before token minting and immediately before push.
- Required workflow rules identify `{ repository_id, path, ref, sha }`, where `sha` is the workflow source revision. Current documented workflow-run metadata exposes the workflow path/ref and the PR commit `head_sha`, but not an attested source SHA. The adapter therefore returns `unavailable` for required-workflow evidence until a trusted SHA-attestation source exists; a matching display name/path/ref cannot count as green. See [required workflow rules](https://docs.github.com/en/enterprise-cloud@latest/rest/repos/rules?apiVersion=2026-03-10) and [workflow runs](https://docs.github.com/en/rest/actions/workflow-runs).

## Phase 2A PR Babysitter core

- The GitHub-agnostic core is implemented in `scripts/loop/`. It returns one
  action (`wait`, `retry-check`, `request-repair`, `escalate`, or
  `ready-for-human`) and cannot make GitHub writes or edit product code.
- PR evidence and schema-v3 state bind to the current head/base/merge SHA tuple.
  Each check also records `testedSha`, which must equal the current head or
  merge SHA. Required workflows are separate evidence identities containing
  repository ID, workflow path, ref, and source SHA. Missing, duplicate,
  stale, partial, or unavailable evidence cannot be treated as green.
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

The Phase 2A decision core and the Phase 2B GitHub App auth, observation
adapter, worktree guard, guarded Actions rerun, repair session, and
`runPrBabysitterCli` orchestration function are implemented. The worktree guard
verifies the local same-repository feature branch and HEAD against the PR,
reloads persisted PR and LoopState records, and captures a stable workspace
fingerprint. Dirty worktrees require the trusted host's task identity and a
matching persisted fingerprint. Before consuming repair approval, the guard
refreshes the full PR SHA tuple; later repair stages repeat that check through
the trusted snapshot refresher.

The repository has no trusted-host factory or standalone CLI entrypoint, so no
live run is enabled and the operational mode remains observe-only. A real Stage
0 observation is pending host bootstrap. Required workflow evidence also stays
unavailable because standard GitHub run metadata does not attest its source
SHA. When a trusted host is added, it must recheck the PR tuple, commit,
workspace fingerprint, final diff, and budget before minting a
`contents:write` token, then recheck the budget immediately before push. Tokens
are repository-scoped and permission-scoped, not branch-scoped; GitHub branch
protection guards protected refs. Phase 2B has no merge authority,
issue-to-Draft-PR dispatch, or post-merge observation. See [[architecture]]
and [[index]].
