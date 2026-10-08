# Stage 1 attempt-bound job rerun design

**Date:** 2026-10-08

**Status:** Proposed for maintainer review. This document does not authorize a
code change, policy change, GitHub App permission change, hosted deployment, or
live Actions rerun.

**Current status (2026-10-08):** PR #296 merged the attempt-scoped single-job
writer after a controlled Actions test showed that GitHub rejects an older job
ID with HTTP 403 once a newer attempt is current. This proposal is retained as
design history; the standalone host still blocks live reruns until its
capability gate is reconciled with the writer and all independent trust gates
pass.

**Related:** [Stage 1 OIDC source-attestation design](2026-10-07-stage1-oidc-workflow-source-attestation-design.md),
[Stage 1 CLI runbook](../../loop-engineering/stage1-cli-runbook.md), and
[readiness evidence](../../loop-engineering/stage1-readiness.md).

## Goal and current boundary

Resolve `run_attempt_write_binding_unavailable` without weakening the rule that
an approval applies to one observed workflow run attempt and its exact failed
job target. Stage 1 remains disabled until the request target is provably bound
to that approval. The current `POST .../actions/runs/{run_id}/rerun-failed-jobs`
must not be used for a live Stage 1 write because its documented inputs do not
include `run_attempt` or a conditional-write precondition.

This is one part of the wider Loop Engineering rollout. It does not authorize
Stage 1 activation or resolve source attestation, trusted workflow/job graph,
approver configuration, persisted CI budget, hosted proof, pilot collection, or
Stage 0 deployment gates. Human review and merge remain required by the
repository workflow.

## GitHub API facts

- The attempt-specific jobs endpoint takes both `run_id` and
  `attempt_number`. Its response includes a unique job `id`, `run_id`, and
  `run_attempt` for each returned job.
- The job rerun endpoint takes a unique `job_id` and reruns that job and its
  dependent jobs. It does not take an `attempt_number` parameter.
- GitHub's documentation does not specify what happens when a caller submits
  a job ID from an older attempt after another attempt has started. It does not
  explicitly guarantee that the write reruns only that historical job or is
  rejected as stale.

These facts make a job-ID write a promising narrower target, but do not by
themselves prove its behavior under the race. Do not remove the hard gate based
only on the fact that the `job_id` path parameter is unique.

Read-only evidence from this repository on 2026-10-08 shows distinct job IDs
across attempts for Hosted Loop Stage 0 run
[`36960149216`](https://github.com/memories-quy-2002/digital-e-shop/actions/runs/36960149216)
at the same head SHA: attempt 1 used `verify` job `110691833515` and `deploy`
job `110691921147`; attempt 2 used `verify` job `110697771002` and `deploy`
job `110697771558`. This supports per-attempt job identity for that observed
workflow. It does not establish the behavior of a rerun POST with an old job ID,
nor does it validate the eligible `loop-foundation.yml` target. No write was
attempted; the hard gate remains.

## Approaches considered

### A. Rerun a job by its attempt-scoped `job_id` — recommended candidate

Read the exact attempt's jobs, validate each returned `run_id` and
`run_attempt`, then bind approval to the unique job ID and the rest of the
current identity tuple. Submit only to
`POST /repos/{owner}/{repo}/actions/jobs/{job_id}/rerun`. Before a pilot, prove
that if a newer attempt appears between the final read and the POST, GitHub
either reruns only the approved job ID or rejects the stale ID. A request must
never be redirected to a different latest job/attempt.

This is the smallest change to the current behavior. The endpoint also reruns
dependents, so the complete trusted graph and dependent-job closure remain
mandatory. For the first pilot, allow only one approved root job in the reviewed
`loop-foundation.yml` graph. Refuse multiple independent retry roots until
their request and budget semantics are designed.

### B. Dispatch a dedicated trusted retry workflow

Instead of mutating the original workflow run, dispatch a fixed workflow from a
reviewed default-branch ref with immutable inputs for the approved run,
attempt, job, SHA, PR tuple, and operation ID. That workflow revalidates the
inputs and performs only the allowlisted retry work. This creates a new run
rather than rerunning the original job.

This avoids selecting work through a mutable run ID, but adds a second workflow,
input validation, idempotency, duplicate-dispatch recovery, and budget-accounting
requirements. It needs its own design if the job-ID endpoint cannot be proven
safe; it is not an automatic fallback.

### C. Keep Stage 1 disabled

Continue read-only observation until GitHub documents an attempt-scoped or
conditional rerun write, or a reviewed alternative supplies equivalent
binding. This is the safest option and does not complete Stage 1.

## Proposed contract for approach A

The target and one-use approval bind all of the following values:

- repository ID and PR number;
- current base, head, and merge SHAs;
- tested SHA;
- workflow ID, path, ref, and verifier-owned source attestation;
- run ID and exact run attempt;
- exact root job ID, job name, and failed conclusion;
- complete trusted dependent-job closure for the attested workflow revision;
- capability, expiry, and unique action-attempt key.

The host obtains the root job only from the attempt-specific jobs endpoint and
rejects incomplete, duplicate, or mismatched job evidence. It checks the full
dependent closure against reviewed host configuration; job names or API output
alone do not establish `needs` relationships. For the first pilot, anything
outside the single reviewed root and its fixed dependent closure is refused.

The writer reserves the finite `ciRunLimit: 2` budget and the one-use action
key before the POST. The transport allowlist permits only the exact job rerun
route for an approved job ID and the required read-only lookups; the run-level
rerun route and every unrelated Actions write remain denied. A network-uncertain
result consumes the reservation and escalates for observation; the host never
retries the POST automatically.

The host still performs fresh pre-write checks for the PR tuple, source
attestation, run status, run attempt, and job evidence. These checks protect the
approval and currentness contract, but they do not substitute for proving the
job-ID endpoint's behavior if the attempt changes after the read.

## Required proof before implementation can enable a live write

1. Obtain authoritative evidence for stale job-ID behavior. Acceptable evidence
   is explicit GitHub documentation/support confirmation or a controlled,
   reviewed test in a disposable repository or explicitly approved non-`main`
   pilot that demonstrates the old job ID cannot cause a different job from a
   newer attempt to run. A mocked fetch test alone is insufficient.
2. Confirm that one approved job-ID request cannot expand beyond the reviewed
   dependent-job closure, including reusable workflows and dynamic matrices.
3. Define how a successful response is reconciled to the new attempt and how
   ambiguous responses remain budgeted without duplicate writes.
4. Keep the existing blocker until items 1–3 are reviewed. If item 1 cannot be
   proved, stop approach A and review approach B as a separate design. Do not
   weaken the identity requirement or treat a final re-read as atomic binding.

## Verification requirements for a later implementation

- A valid target uses an attempt-scoped job ID and sends the exact job-ID route.
- Wrong repository, run, attempt, tested SHA, attestation, PR tuple, or job ID
  causes refusal before any POST.
- A race fixture that advances the run attempt after approval never changes the
  job ID submitted; any response whose semantics are uncertain escalates.
- Multiple roots, incomplete pagination, unknown dependent jobs, and dynamic or
  unreviewed graphs fail closed.
- Duplicate approvals and action keys do not create duplicate POSTs; network
  uncertainty is not retried automatically and remains counted against budget.
- Only after the controlled stale-ID proof and all other Stage 1 gates pass may
  a maintainer authorize a non-`main` pilot. The pilot must use a real,
  eligible flaky failure and preserve the existing finite CI budget.

## Independent gates that remain

- Obtain positive hosted proof for the merged OIDC workflow-source attestation
  path, then verify a later same-repository PR whose workflow source SHA differs
  from its tested SHA. The labeled control probe remains unavailable, so this
  gate is still open.
- Review a complete workflow and dependent-job graph for the eligible workflow.
- Configure a trusted numeric approver identity and a host-managed persisted
  LoopState session bound to the exact canonical policy revision.
- Preserve exact-path approval, finite retry and wall-clock budgets, protected
  path refusal, and human-controlled PR review and merge.
- Meet the readiness evidence requirements in the maintained Stage 1 runbook
  before promotion. Local fixtures and unit tests do not count as hosted pilot
  evidence.

## References

- [List jobs for a workflow run attempt](https://docs.github.com/en/rest/actions/workflow-jobs#list-jobs-for-a-workflow-run-attempt)
- [Re-run a job from a workflow run](https://docs.github.com/en/rest/actions/workflow-runs#re-run-a-job-from-a-workflow-run)
- [Re-run failed jobs from a workflow run](https://docs.github.com/en/rest/actions/workflow-runs#re-run-failed-jobs-from-a-workflow-run)
