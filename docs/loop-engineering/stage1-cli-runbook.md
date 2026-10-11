# Stage 1 CLI runbook

**Updated:** 2026-10-10

**Status:** The trusted dispatch host and recovery workflow are implemented on `feature/stage1-trusted-dispatch`. Stage 1 remains blocked for live use until the change is reviewed and merged, local trust identities and a per-PR budget session are configured, the GitHub App receives `actions:write`, and a maintainer-selected pilot proves the full hosted path.

## Current implementation status (2026-10-10)

The reviewed direction replaces the older attempt-bound job-rerun writer. The
implementation branch adds a selector for one failed `client` or `server`
Check Run from App `15368`, a one-use approval for its complete PR tuple and
workflow identity, a budget-reserved dispatch to the fixed workflow on
`main`, a separate verifier and Check Run publisher, and an observer bound to
the `workflow_run_id` returned by GitHub. The verifier checks the exact
approved SHA using the same composite action now referenced by normal CI.
Only the publisher job has `checks: write`; it cannot checkout or run PR code.

The host now connects the selector, typed approval, exact-tuple revalidation,
budget reservation, fixed workflow dispatch, exact returned-run observer, and
source-attestation verifier. The publisher token is confined to fixed reads
and one PATCH of the approved existing Check Run. The retry workflow has
separate `verify`, `attest`, and `publish` jobs; only `publish` receives
`checks: write`, while the host's GitHub App needs `actions:write` to dispatch.

These changes have local unit and static-test coverage only. They do not prove
that GitHub accepts a cross-run Check Run update or that branch protection
recognizes it. The Stage 1 workflow is not yet on `main`, the App has not been
granted `actions:write`, no user-local trust file or budget session has been
configured, and no dispatch, Check Run PATCH, or live pilot has occurred. No
App permission, branch protection, production configuration, or main-branch
change was made.

PR #302's live inspection reported all five required check contexts green on
its head SHA (`77dca7fd0f04b705182a669dd1d2254559e448c9`). Its required-workflow
policy contained zero identities and `workflowEvidence` was empty. This is
current-check evidence for that PR only; it did not exercise workflow-source
attestation, trusted retry dispatch, or Check Run publication.

The CLI exposes `inspect`, `initialize-budget`, and `rerun-flaky`. Inspection
remains read-only apart from bounded `.loop/pr/` observation state. Budget
initialization requires a fresh PR tuple and exact `INITIALIZE <pr>` TTY
confirmation; it creates one LoopState file bound to that base/head SHA pair
and the canonical finite policy under the OS-resolved user's home. Before each
budget operation the host resolves both paths and refuses to read or write if
the effective `<OS home>/.loop/state/` path is inside the PR checkout. It also
refuses to overwrite an existing session. Checkout-local `.loop/state/` files
are not authoritative for Stage 1 budget checks; a checkout that contains the
user-local store cannot be used for this budget session.
`rerun-flaky --dry-run` checks syntax only and provides no eligibility or
approval evidence.

PR #300 merged the source-attestation producer and recorded a successful
hosted producer-to-probe result. The Stage 1 `inspect` path now configures the
GitHub CLI attestation provider with a separate `source-attestation:read`
installation token and asks the
PR client to verify each required-workflow identity from a fresh, complete
ruleset snapshot. It reports `workflowEvidence.status: "verified"` and a
bounded `sourceSha` only when the verifier returns its private record and the
PR client confirms that record matches the exact workflow identity, run,
attempt, tested SHA, and current PR tuple. The probe's `sourceShaCandidate` is
never used as trust input. `inspect` is still read-only. The host loads
trusted approver and workflow actor numeric IDs only from the fixed user-local
configuration path below; environment variables and CLI arguments cannot
supply or override them. The persisted LoopState session is checked against
the exact PR base/head tuple and canonical policy limits before dispatch.

## Source-SHA feasibility result

The legacy read-only probe introduced by PR #291 ran against `Loop Foundation` run
`37418888640` (attempt `1`, tested SHA
`f32bab895e4ad8bf7bc6f5f3dc3dbb0ed954a126`). Its event/API comparison returned
`source_sha_unavailable`; both source-SHA candidate fields were `null`. The
[upstream run](https://github.com/memories-quy-2002/digital-e-shop/actions/runs/37418888640)
and [probe run](https://github.com/memories-quy-2002/digital-e-shop/actions/runs/37418918573)
are the evidence sources.

That run predates the OIDC certificate verifier and remains historical
feasibility evidence. PR #293 merged the implementation to `main`. It creates
a canonical descriptor and an opt-in attestation for a labeled,
same-repository PR. Its downstream read-only probe checks the certificate
against the exact run, attempt, and current PR tuple, then reports only a
bounded source-SHA candidate. It never trusts raw `workflow_sha`, `source_sha`,
or predicate fields. The later labeled control run below did not produce a
hosted candidate. A candidate does not enable Stage 1.

## Attestation contract and verification

The producer runs only after the exact `loop-stage1-attestation-pilot` label is
added to an open same-repository PR. It waits for the `test` job, does not
check out PR code, and writes one subject named
`digital-e-loop-workflow-source.json`. Its SHA-256 digest covers canonical
UTF-8 JSON with these fields: `schemaVersion`, `repositoryId`, `workflowId`,
`workflowPath`, `workflowRef`, `runId`, `runAttempt`, `eventName`, `testedSha`,
and `pullRequest`. The PR tuple contains `number`, `baseSha`, `headSha`, and
`mergeSha`. The descriptor never contains a source SHA.

The verifier needs GitHub CLI `2.92.0` or later and a read-only GitHub token.
It rebuilds the descriptor from fresh run and PR observations, then runs
`gh attestation verify` with the fixed repository, workflow path, OIDC issuer,
JSON output, and result limit. Trust mode also pins the allowlisted source SHA.
The verifier reads `githubWorkflowSHA` from the verified certificate and
requires it to equal `buildSignerDigest`. It checks the subject digest, workflow
identity, repository ID, run ID, attempt, and an in-run verified timestamp.
It ignores the statement predicate and raw event/API source-SHA fields.

The downstream `workflow_run` probe fetches that exact run and queries one
complete page of PRs by `head_branch`. It requires one same-repository PR whose
head SHA or merge SHA matches the tested SHA, then verifies the certificate
without an allowlisted source SHA. Its frozen output exposes
`sourceShaCandidate` as untrusted feasibility metadata; it never creates the
verifier-owned record used by trust mode. The Stage 1 CLI does not consume this
probe output; it independently performs verifier-backed inspection from fresh
PR and required-workflow observations. A candidate cannot authorize a rerun.

On 2026-10-08, the labeled same-repository PR [#297](https://github.com/memories-quy-2002/digital-e-shop/pull/297) produced a successful attestation in [run 37751138161](https://github.com/memories-quy-2002/digital-e-shop/actions/runs/37751138161), but the hosted read-only [probe 37751216313](https://github.com/memories-quy-2002/digital-e-shop/actions/runs/37751216313) returned `unavailable` with no candidate. This remains historical negative evidence for that run. After the verifier wiring fix, PR #300's fresh producer run [37880908533](https://github.com/memories-quy-2002/digital-e-shop/actions/runs/37880908533) succeeded and the read-only probe [37880957685](https://github.com/memories-quy-2002/digital-e-shop/actions/runs/37880957685) returned `candidate_present` for the exact PR tuple. That proves hosted producer-to-probe feasibility only; it is not a Stage 1 host inspection record or rerun authorization.

## Historical attempt-bound rerun feasibility result

A controlled test on same-repository, non-`main`, documentation-only PR #294
used the `Loop Foundation` workflow, which has no deployment job. Attempt 1's
`test` job (`113109016799`) was rerun successfully and produced attempt 2's
`test` job (`113182145888`), which completed successfully. Submitting the
attempt 1 job ID again returned GitHub HTTP `403` with
`Only jobs from the current attempt can be re-run`. The run remained at attempt
2; the stale ID did not create attempt 3. See the [workflow run](https://github.com/memories-quy-2002/digital-e-shop/actions/runs/37714893275)
and [PR #294](https://github.com/memories-quy-2002/digital-e-shop/pull/294).

This establishes stale-job-ID rejection for the superseded job-rerun endpoint.
The current trusted-dispatch path does not use a run-rerun or job-rerun API.

## Current commands

After review and merge, run the CLI entrypoint from a clean, reviewed `main`
checkout that contains the Stage 1 implementation. Keep the PR worktree as the
current directory: the CLI reads its target checkout and derives the PR SHA
from that working directory, while Node loads the CLI and its modules from the
trusted `main` path. Do not invoke the CLI entrypoint from the PR worktree.

Set these paths once in PowerShell, replacing the examples with the clean
`main` checkout and the matching same-repository PR worktree. The helper
refuses a `main` checkout on another branch, with tracked/untracked changes,
or whose HEAD is not the current `main` SHA on the canonical repository. It
then runs every command with the PR worktree as its current directory:

```powershell
$trustedMainRoot = (Resolve-Path 'C:\path\to\clean-main-checkout').Path
$prWorktree = (Resolve-Path 'C:\path\to\selected-pr-worktree').Path
$trustedMainBranch = git -C $trustedMainRoot branch --show-current
if ($LASTEXITCODE -ne 0 -or $trustedMainBranch -ne 'main') { throw 'Trusted CLI checkout must be on main.' }
$trustedMainStatus = git -C $trustedMainRoot status --porcelain=v1 --untracked-files=all
if ($LASTEXITCODE -ne 0 -or $trustedMainStatus) { throw 'Trusted CLI checkout must be clean.' }
$trustedMainCommit = git -C $trustedMainRoot rev-parse --verify HEAD
if ($LASTEXITCODE -ne 0 -or $trustedMainCommit -notmatch '^[0-9a-f]{40}$') { throw 'Trusted CLI HEAD is unavailable.' }
$remoteMainRecord = git ls-remote --exit-code 'https://github.com/memories-quy-2002/digital-e-shop.git' refs/heads/main
if ($LASTEXITCODE -ne 0 -or -not $remoteMainRecord) { throw 'Could not verify current canonical main.' }
$remoteMainCommit = ($remoteMainRecord -split '\s+')[0]
if ($trustedMainCommit -ne $remoteMainCommit) { throw 'Trusted CLI checkout must match the current canonical main commit.' }
$stage1Cli = Join-Path $trustedMainRoot 'scripts/loop/pr-babysitter-stage1-host.mjs'
if (-not (Test-Path $stage1Cli -PathType Leaf)) { throw 'Stage 1 CLI is missing from trusted main.' }

function Invoke-TrustedStage1 {
  param([Parameter(Mandatory)][string[]]$CliArgs)
  Push-Location $prWorktree
  try {
    node $stage1Cli @CliArgs
    $stage1ExitCode = $LASTEXITCODE
    if ($stage1ExitCode -notin 0..4) { throw "Trusted Stage 1 CLI returned unexpected exit code $stage1ExitCode." }
    return $stage1ExitCode
  } finally {
    Pop-Location
  }
}
```

The helper returns the CLI exit code: `0` means ready, `1` means wait,
`2` means escalated, `3` means refused, and `4` means infrastructure error.
The JSON result printed by the CLI remains the authoritative decision detail.

Keep the App private-key file outside both checkouts. The PR worktree is the
target whose SHA and bounded `.loop/pr/` metadata are inspected; it must match
the maintainer-selected, same-repository feature PR.

Run `inspect` through the trusted helper:

```powershell
Invoke-TrustedStage1 -CliArgs @('inspect', '--repo', 'memories-quy-2002/digital-e-shop', '--pr', '123')
```

The PR number must be selected by the maintainer; the placeholder above is not
a pilot identity. Interpret `wait` and `escalated` as decisions, not as CI
success or infrastructure failure. Required workflow evidence without a
matching verifier-owned source attestation remains unavailable. Source
verification uses GitHub CLI 2.92.0 or later and a dedicated App installation
token with the `source-attestation:read` capability. That token adds
only repository `Attestations: read` to the existing observe permissions;
Stage 0's observe token is unchanged. The installed App must have this
repository permission enabled. It does not grant Actions write access.

Initialize a local finite-budget session for the current PR tuple before a
retry. This requires a real TTY, prints the current base/head SHA and canonical
limits, and creates one session only after the exact `INITIALIZE <pr>` reply:

```powershell
Invoke-TrustedStage1 -CliArgs @('initialize-budget', '--repo', 'memories-quy-2002/digital-e-shop', '--pr', '123')
```

The state is stored at `<os.userInfo().homedir>/.loop/state/stage1-pr-<pr>-<base-prefix>-<head-prefix>.json`.
To inspect the operating-system-resolved home in PowerShell, run
`node -p "require('node:os').userInfo().homedir"`. The file is bound to that PR
base/head tuple and the canonical budget limits. The command refuses to
overwrite an existing session; do not edit its counters by hand. The Stage 1
host ignores a checkout's `.loop/state/` when reading or reserving this budget.

For dispatch, create the fixed user-local file under the operating-system
account home returned by Node's `os.userInfo().homedir` (on Windows, check it
with `node -p "require('node:os').userInfo().homedir"`), at
`.config/digital-e/loop-engineering/stage1-trust.json`. The trust loader uses
that OS-resolved home and ignores `USERPROFILE`; a lookup error or invalid home
fails closed. The file must contain exactly this shape, replacing placeholders
with positive numeric GitHub user IDs:

```json
{
  "schemaVersion": 1,
  "repositoryId": 743050379,
  "trustedApproverIds": [<numeric-maintainer-user-id>],
  "workflowActorId": <numeric-loop-runner-user-id>,
  "workflowActorLogin": "digital-e-loop-runner[bot]"
}
```

The placeholders are not valid JSON until replaced. Keep the file accessible
only to the local account and administrators; it contains no credential. The
actor login, repository, and workflow path are fixed in code. Environment
variables and command arguments cannot supply or override these trust inputs.
Dispatch also needs the normal read-only GitHub App setup from the
[Phase 2 runbook](phase-2-pr-babysitter-runbook.md), GitHub CLI 2.92.0 or
later, and repository `Attestations: read` permission.

Syntax-only dry run:

```powershell
Invoke-TrustedStage1 -CliArgs @('rerun-flaky', '--repo', 'memories-quy-2002/digital-e-shop', '--pr', '123', '--dry-run')
```

The live command requires the budget session, trust file, a real TTY, current
eligible flaky evidence, and a separately approved App installation with
`actions:write`. The current installation lacks `actions:write`, and this
branch has not put the workflow on `main`; no live dispatch can be proven from
this checkout. A dry-run is not approval or pilot evidence.

## Fail-closed preflight

After review and merge, run the live command only for a maintainer-selected
pilot PR. The host reads current PR evidence and state before asking for typed
approval; it then rechecks the tuple after approval and token minting, reserves
the finite budget, and dispatches once. Missing trust, App permissions, budget,
workflow identity, or exact evidence fails closed.

```powershell
Invoke-TrustedStage1 -CliArgs @('rerun-flaky', '--repo', 'memories-quy-2002/digital-e-shop', '--pr', '123')
```

At the time of this branch implementation, the local trust file and budget
session are not configured, the GitHub App lacks `actions:write`, and the
workflow exists only on this feature branch. No live dispatch should be
attempted; local preflight status does not establish PR eligibility.

The `--dry-run` form checks arguments only. It returns `status: dry-run` and
does not inspect a PR, approve an action, or test whether GitHub would accept a
rerun.

## Refusal codes

| Reason code | Meaning | Operator action |
| --- | --- | --- |
| `stage1_trust_configuration_unavailable` | The fixed user-local trust file is absent. | Configure numeric trusted approver and workflow actor IDs in the file; never pass them through env or CLI. |
| `ci_run_budget_session_unavailable` | No exact-tuple user-local budget session exists, OS home resolution failed, or the effective user-local store is inside the PR checkout. | For a missing session, run `initialize-budget` from the matching checkout and confirm its printed SHA tuple. If the checkout contains `<OS home>/.loop/state/`, use a checkout outside that store path; do not copy or edit the counters. |
| `ci_run_budget_session_stale` | Saved base/head SHA or canonical budget differs from the current PR. | Stop and inspect fresh evidence; do not edit persisted counters. |
| `interactive_tty_required` | A live rerun was requested without a real interactive terminal. | Stop; typed human approval must remain interactive. |
| `stage1_command_refused` | The command is outside the Stage 1 CLI allowlist. | Use `inspect`, `initialize-budget`, or `rerun-flaky`; repair, push, and merge remain unavailable in Stage 1. |
| `repository_not_allowlisted` | The requested repository is not the fixed repository. | Stop and check the command; do not change the repository through an environment override. |

The trusted-dispatch path does not use a run-rerun or job-rerun endpoint. It
dispatches one fixed verifier from `main`, then observes only the exact run ID
returned by GitHub. The older `run_attempt_write_binding_unavailable` blocker
belongs to the superseded attempt-bound design; it is not a Stage 1 dispatch
capability or a reason to enable a write. Current host/configuration,
authenticated-approver, persisted-budget, workflow-identity, and live-readiness
gates remain fail-closed.

The CLI reports a successful POST only as submitted/waiting. Only a fresh
observation of the exact returned run ID, verified source attestation and
actor, three allowlisted jobs, current PR tuple, unchanged required-check
policy, and original Check Run turning green can return `ready-for-human`.

## Gates before a live pilot

Do not enable the capability until all of these are independently reviewed and
available from trusted host configuration:

1. The reviewed OIDC producer and verifier must prove the exact workflow source
   SHA from certificate claims and bind it to repository ID, workflow path/ref,
   run ID and attempt, tested SHA, and the current PR tuple. Only the
   verifier-owned record may carry that identity into the adapters. Stage 1
   `inspect` configures the verifier; a run-level result remains unavailable
   unless fresh required-workflow identity and attestation evidence match
   exactly. Unknown or mismatched evidence must refuse without fallback. The
   hosted producer-to-probe proof does not substitute for a host observation.
2. A complete, reviewed workflow and job graph allowlist. It must account for
   reusable workflows, local actions, dependent jobs, secrets, protected
   environments, token permissions, and dynamic matrices.
3. A host-managed LoopState session initialized from the reviewed canonical
   `ciRunLimit: 2` policy and validated against that exact policy revision.
   Missing, corrupt, stale, or mismatched persisted state must refuse.
4. A separately reviewed GitHub App `actions:write` capability and numeric
   trusted-approver allowlist. Do not change the Stage 0 Worker or publisher
   permissions to enable reruns.
5. A maintainer-selected same-repository, non-`main` pilot PR and fresh
   read-only evidence showing the exact current SHA tuple and an eligible
   flaky failure. Do not use a deliberately weakened security or test job.
6. A fresh TTY approval bound to the exact PR tuple, tested SHA, required
   context/App ID, existing Check Run ID, fixed workflow identity/source SHA,
   actor, request ID, capability, and expiry. Confirmation defaults to cancel.
   The host must re-read evidence, consume approval once, reserve budget, and
   dispatch once to the fixed workflow ID on `main`.

The earlier run/job-rerun endpoint is not used by the trusted-dispatch path.
The new writer permits only the fixed `workflow_dispatch` endpoint and requires
GitHub's returned `workflow_run_id`; uncertain outcomes consume the reserved
attempt and never trigger a second dispatch. The host must poll only that run
ID and independently verify its source SHA, actor, verifier/publisher jobs,
current PR tuple, policy, and original Check Run before reporting
`ready-for-human`.

At this branch revision, the local trust file and budget session are not
configured, the App lacks `actions:write`, and the workflow is not yet on
`main`. Do not attempt a live dispatch or Check Run update. These gates are
separate from the historical PR #300 producer-to-probe result below.

PR #290 added the dedicated Stage 1 target, prompt, source-attestation, and
host suites to both fixed test lists. PR #291 added the original source-SHA
feasibility probe; its hosted `Loop Foundation` test passed on the reviewed PR
head and after merge ([run 37418888640](https://github.com/memories-quy-2002/digital-e-shop/actions/runs/37418888640)).
The 2026-10-10 feature branch adds the trusted host dispatch orchestration,
user-local identity configuration, one-time budget initialization, fixed
workflow descriptor attestation, and exact Check Run publication. Local
verification is recorded in the readiness file; the new retry workflow's
hosted source-attestation and cross-run publication have not run.

For a separately authorized pilot after merge, inspect first, approve and
dispatch once, then observe the exact returned run ID. Record only bounded
identifiers, timestamps, SHA values, budget consumption, status, and reason
code. Never record credentials, raw CI logs, review bodies, or prompts. A
green workflow without the exact original Check Run becoming green is not
success.

## Disable procedure

If Stage 1 is ever enabled and an operational issue occurs, stop invoking the
rerun command and remove or revoke the trusted host's Stage 1 Actions-write
capability and trust configuration. Keep Stage 0 observation available if it
remains healthy, retain bounded state for diagnosis, and do not modify
production application data. Re-enablement requires a new review of the cause,
trust configuration, budget, and pilot evidence.

## Current evidence

See [readiness evidence](stage1-readiness.md) for the promotion gates and
collection limits, and the [OIDC workflow-source attestation design](../superpowers/specs/2026-10-07-stage1-oidc-workflow-source-attestation-design.md)
for the proposed trust boundary and its verification criteria. No live Stage 1
pilot has run.

On 2026-10-09, local `inspect --pr 300` refused with
`app_configuration_missing` before contacting GitHub. The local environment had
no Stage 1 GitHub App configuration, and the repository had no open PR to
inspect. Therefore the App-backed verifier and effective `Attestations: read`
installation permission remain unverified; this refusal is not a pilot
observation.
