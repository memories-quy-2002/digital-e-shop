# Stage 1 CLI runbook

**Updated:** 2026-10-08

**Status:** Offline implementation only; live reruns are disabled.

This runbook describes the current Stage 1 CLI boundary and the gates for a
future pilot. The current host does not submit Actions reruns. Its `inspect`
command delegates to the read-only Stage 0 host; a real `rerun-flaky` command
returns `stage1_prerequisites_unavailable` before loading credentials or
contacting GitHub. `rerun-flaky --dry-run` checks command syntax only. It does
not inspect a PR, authenticate an approver, select an eligible run, or prove
that a rerun could be submitted.

This branch adds the source-attestation producer, GitHub CLI verifier, and
read-only workflow-run probe. The Stage 1 host does not wire them into a live
rerun, so its trust status remains unavailable. A trusted workflow/job
allowlist, trusted approver list, and host-managed LoopState CI budget session
also remain absent. PR #289 set the canonical `ciRunLimit` to `2`, but the
Stage 1 host does not bind a persisted session budget to that policy revision.
Environment variables and CLI arguments cannot supply or override these trust
inputs.

## Source-SHA feasibility result

The legacy read-only probe introduced by PR #291 ran against `Loop Foundation` run
`37418888640` (attempt `1`, tested SHA
`f32bab895e4ad8bf7bc6f5f3dc3dbb0ed954a126`). Its event/API comparison returned
`source_sha_unavailable`; both source-SHA candidate fields were `null`. The
[upstream run](https://github.com/memories-quy-2002/digital-e-shop/actions/runs/37418888640)
and [probe run](https://github.com/memories-quy-2002/digital-e-shop/actions/runs/37418918573)
are the evidence sources.

That run predates the OIDC certificate verifier and remains historical
feasibility evidence. The current local implementation creates a canonical
descriptor and an opt-in attestation for a labeled, same-repository PR. Its
downstream read-only probe checks the certificate against the exact run,
attempt, and current PR tuple, then reports only a bounded source-SHA
candidate. It never trusts raw `workflow_sha`, `source_sha`, or predicate
fields. The hosted proof remains pending until this implementation is reviewed
and merged, then exercised by a later same-repository PR whose workflow source
SHA differs from its tested SHA. The candidate does not enable Stage 1.

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
verifier-owned record used by trust mode. The Stage 1 CLI does not configure
this provider, so a candidate cannot authorize a rerun.

## Attempt-bound rerun feasibility result

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
The standalone Stage 1 host still refuses live reruns; source attestation, the
trusted job graph, approver configuration, and a host-managed budget session
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
trusted source-SHA attestation remains unavailable.

Syntax-only dry run:

```powershell
node scripts/loop/pr-babysitter-stage1-host.mjs rerun-flaky --repo memories-quy-2002/digital-e-shop --pr <selected-pr> --dry-run
```

The live command is intentionally unavailable. Do not grant `actions:write`,
attempt to bypass the refusal, or treat a dry-run as approval or pilot evidence.

## Refusal codes

| Reason code | Meaning | Operator action |
| --- | --- | --- |
| `stage1_prerequisites_unavailable` | At least one trusted Stage 1 prerequisite is absent. Current blockers are `workflow_source_sha_unattested`, `ci_run_budget_session_unavailable`, `stage1_trust_configuration_unavailable`, `trusted_job_graph_unavailable`, and `run_attempt_write_binding_unavailable`. | Stop. Complete the source trust, allowlist, and host-managed budget-session work; do not change the already-reviewed canonical policy as a workaround. |
| `interactive_tty_required` | A live rerun was requested without a real interactive terminal. | Stop; do not pipe or automate approval. This does not override the current prerequisite refusal. |
| `stage1_command_refused` | The command is outside the Stage 1 CLI allowlist. | Use only documented read-only `inspect`; repair, push, and merge remain unavailable. |
| `repository_not_allowlisted` | The requested repository is not the fixed repository. | Stop and check the command; do not change the repository through an environment override. |

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
   verifier-owned record may carry that identity into the adapters. The local
   adapter wiring exists, but the Stage 1 host does not configure it and hosted
   proof is pending. Unknown or mismatched evidence must refuse without
   fallback.
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
6. A fresh TTY approval bound to the exact PR tuple, tested SHA, workflow/run/
   attempt/job target, capability, and expiry. Confirmation defaults to
   cancel. The host must re-read evidence and reserve budget/idempotency before
   the one allowed root-job rerun request.

The run-level failed-jobs endpoint accepts a workflow `run_id` without a
`run_attempt`. PR #296 merged the guarded writer's use of one exact job ID from
the selected attempt, and the controlled test found that the job-specific
endpoint rejects an ID from an older attempt once a newer attempt is current.
The standalone host still reports
`run_attempt_write_binding_unavailable` and remains fail-closed until its
capability gate is reviewed against the new writer. This test does not qualify
a workflow's dependent-job closure or enable a live pilot.

The job API reports runtime job identities and statuses but does not report
the workflow's `needs` graph. The current writer allowlist stores only job
names, while the TTY review requires a complete graph. A future host must load
the graph from trusted reviewed configuration or parse the exact attested
workflow source; unknown dependencies or dynamic graphs remain blocked by
`trusted_job_graph_unavailable`.

PR #290 added the dedicated Stage 1 target, prompt, source-attestation, and
host suites to both fixed test lists. PR #291 added the original source-SHA
feasibility probe; its hosted `Loop Foundation` test passed on the reviewed PR
head and after merge ([run 37418888640](https://github.com/memories-quy-2002/digital-e-shop/actions/runs/37418888640)).
The current branch adds the OIDC descriptor, producer, verifier, adapter
guards, and certificate-backed read-only probe. Local tests pass; the hosted
producer-to-probe proof has not run.

For the pilot, inspect first, approve and submit once, then inspect the new
attempt and record only bounded identifiers, timestamps, SHA values, budget
consumption, status, and reason code. Never record credentials, raw CI logs,
review bodies, or prompts. A missing Stage 0 report is not evidence that CI
passed.

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
