# Stage 1 CLI runbook

**Updated:** 2026-10-09

**Status:** Trusted dispatch implementation is under review; the standalone host remains fail-closed and no live retry or Check Run update has been enabled.

## Trusted dispatch implementation status (2026-10-09)

The reviewed direction replaces the older attempt-bound job-rerun writer. The
implementation branch adds a selector for one failed `client` or `server`
Check Run from App `15368`, a one-use approval for its complete PR tuple and
workflow identity, a budget-reserved dispatch to the fixed workflow on
`main`, a separate verifier and Check Run publisher, and an observer bound to
the `workflow_run_id` returned by GitHub. The verifier checks the exact
approved SHA using the same composite action now referenced by normal CI.
Only the publisher job has `checks: write`; it cannot checkout or run PR code.

These changes are local implementation and mock/static-test evidence. They do
not establish that GitHub accepts a cross-run update or that branch protection
recognizes it. The existing standalone CLI still refuses because the trusted
approver ID, host-owned workflow/actor configuration, persisted LoopState
budget session, and fully wired dispatch/observer runtime are unavailable.
The GitHub App has not been granted Actions write, and no dispatch, Check Run
PATCH, pilot, or main-branch change has occurred.

PR #302's live inspection reported all five required check contexts green on
its head SHA (`77dca7fd0f04b705182a669dd1d2254559e448c9`). Its required-workflow
policy contained zero identities and `workflowEvidence` was empty. This is
current-check evidence for that PR only; it did not exercise workflow-source
attestation, trusted retry dispatch, or Check Run publication.

This runbook describes the current Stage 1 CLI boundary and the gates for a
future pilot. The current host does not submit Actions reruns. Its `inspect`
command delegates to the read-only Stage 0 host; a real `rerun-flaky` command
returns `stage1_prerequisites_unavailable` before loading credentials or
contacting GitHub. `rerun-flaky --dry-run` checks command syntax only. It does
not inspect a PR, authenticate an approver, select an eligible run, or prove
that a rerun could be submitted.

PR #300 merged the source-attestation producer and recorded a successful
hosted producer-to-probe result. The Stage 1 `inspect` path now configures the
GitHub CLI attestation provider with a separate `source-attestation:read`
installation token and asks the
PR client to verify each required-workflow identity from a fresh, complete
ruleset snapshot. It reports `workflowEvidence.status: "verified"` and a
bounded `sourceSha` only when the verifier returns its private record and the
PR client confirms that record matches the exact workflow identity, run,
attempt, tested SHA, and current PR tuple. The probe's `sourceShaCandidate` is
never used as trust input. `inspect` is still read-only. The trusted
approver/job configuration and host-managed LoopState CI budget session remain
absent, so the live rerun command remains blocked. PR #289 set the canonical
`ciRunLimit` to `2`, but the Stage 1 host does not bind a persisted session
budget to that policy revision. Environment variables and CLI arguments
cannot supply or override these trust inputs.

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

This establishes stale-job-ID rejection for the tested job-rerun endpoint.
The guarded-writer change was merged in PR #296. It uses that endpoint with
exactly one root job ID from matching, complete attempt-specific evidence.
Multiple requested roots and attempts with multiple failed roots are refused.
The standalone Stage 1 host still refuses live reruns. Its read-only inspect
path can now verify source attestation for a current required workflow; the
trusted job graph, approver configuration, and host-managed budget session
remain unavailable.

## Current commands

Run `inspect` only from a clean checkout matching a maintainer-selected,
same-repository feature PR. It preserves the Stage 0 read-only behavior and
may update bounded local `.loop/pr/` metadata:

```powershell
node scripts/loop/pr-babysitter-stage1-host.mjs inspect --repo memories-quy-2002/digital-e-shop --pr <selected-pr>
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

Syntax-only dry run:

```powershell
node scripts/loop/pr-babysitter-stage1-host.mjs rerun-flaky --repo memories-quy-2002/digital-e-shop --pr <selected-pr> --dry-run
```

The live command is intentionally unavailable. Do not grant `actions:write`,
attempt to bypass the refusal, or treat a dry-run as approval or pilot evidence.

## Reproduce the current refusal

Run the live command only to confirm the current fail-closed response. The
Stage 1 host checks its hard-coded prerequisite list before it reads a token,
inspects the selected PR, or calls GitHub.

```powershell
node scripts/loop/pr-babysitter-stage1-host.mjs rerun-flaky --repo memories-quy-2002/digital-e-shop --pr <selected-pr>
```

With the current host, the command exits with code `3` and returns
`stage1_prerequisites_unavailable`. The blockers include
`stage1_dispatch_runtime_unavailable` and `stage1_host_observer_unavailable`,
along with trust, source-attestation, job-graph, and budget gates. This response does not describe the
selected PR or a workflow attempt. It is not pilot evidence.

The `--dry-run` form checks arguments only. It returns `status: dry-run` and
does not inspect a PR, approve an action, or test whether GitHub would accept a
rerun.

## Refusal codes

| Reason code | Meaning | Operator action |
| --- | --- | --- |
| `stage1_prerequisites_unavailable` | At least one trusted Stage 1 prerequisite is absent. Current blockers include `workflow_source_sha_unattested`, `ci_run_budget_session_unavailable`, `stage1_trust_configuration_unavailable`, `stage1_dispatch_runtime_unavailable`, `trusted_job_graph_unavailable`, and `stage1_host_observer_unavailable`. | Stop. Complete host-owned trust, workflow configuration, and persisted budget-session work; do not change the already-reviewed canonical policy as a workaround. |
| `interactive_tty_required` | A live rerun was requested without a real interactive terminal. | Stop; do not pipe or automate approval. This does not override the current prerequisite refusal. |
| `stage1_command_refused` | The command is outside the Stage 1 CLI allowlist. | Use only documented read-only `inspect`; repair, push, and merge remain unavailable. |
| `repository_not_allowlisted` | The requested repository is not the fixed repository. | Stop and check the command; do not change the repository through an environment override. |

The trusted-dispatch path does not use a run-rerun or job-rerun endpoint. It
dispatches one fixed verifier from `main`, then observes only the exact run ID
returned by GitHub. The older `run_attempt_write_binding_unavailable` blocker
belongs to the superseded attempt-bound design; it is not a Stage 1 dispatch
capability or a reason to enable a write. Current host/configuration,
authenticated-approver, persisted-budget, workflow-identity, and live-readiness
gates remain fail-closed.

No current CLI outcome reports a submitted rerun or a new CI pass. Once a
reviewed host can submit a request, a successful POST must be reported as
submitted/waiting. Only a fresh observation of the new run attempt may report
its pending, failed, or passed state.

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

The standalone Stage 1 CLI still refuses because the host-owned approver ID,
workflow/actor configuration, persisted budget session, and dispatch/observer
runtime are not configured. Caller environment variables cannot supply them.
The existing app installation also lacks the separately reviewed
`actions:write` permission. Do not attempt a live dispatch or Check Run update.

PR #290 added the dedicated Stage 1 target, prompt, source-attestation, and
host suites to both fixed test lists. PR #291 added the original source-SHA
feasibility probe; its hosted `Loop Foundation` test passed on the reviewed PR
head and after merge ([run 37418888640](https://github.com/memories-quy-2002/digital-e-shop/actions/runs/37418888640)).
The current branch adds the OIDC descriptor, producer, verifier, adapter
guards, and certificate-backed read-only probe. Local tests pass; the hosted
producer-to-probe proof has not run.

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
