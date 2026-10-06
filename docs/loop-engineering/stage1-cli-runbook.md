# Stage 1 CLI runbook

**Updated:** 2026-10-06

**Status:** Offline implementation only; live reruns are disabled.

This runbook describes the current Stage 1 CLI boundary and the gates for a
future pilot. The current host does not submit Actions reruns. Its `inspect`
command delegates to the read-only Stage 0 host; a real `rerun-flaky` command
returns `stage1_prerequisites_unavailable` before loading credentials or
contacting GitHub. `rerun-flaky --dry-run` checks command syntax only. It does
not inspect a PR, authenticate an approver, select an eligible run, or prove
that a rerun could be submitted.

The host trust status is intentionally unavailable: there is no reviewed
workflow-source attestation provider, no trusted workflow/job allowlist, no
trusted approver list, and no host-managed LoopState CI budget session. The
canonical policy now sets `ciRunLimit` to `2` after PR #289, but the Stage 1
host does not load and bind a persisted session budget to that policy revision.
Environment variables and CLI arguments cannot supply or override these trust
inputs.

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

1. An authenticated workflow-source attestation producer and cryptographic
   verifier that bind repository ID, workflow path/ref/source SHA, run ID and
   attempt, tested SHA, and current PR tuple. Its adapter must explicitly bridge
   raw GitHub run metadata to the verifier; the current client reports the
   source SHA as unattested and the verifier expects an already-attested value.
   Unknown or mismatched evidence must refuse without fallback.
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
   the one allowed failed-jobs rerun request.

The current GitHub failed-jobs rerun endpoint accepts a workflow `run_id` but
no `run_attempt`. Its documented request has no conditional-write precondition
such as `If-Match`; ETag guidance is for conditional reads and does not provide
a lock for this POST. The guarded writer now re-reads and verifies the selected
attempt after reserving budget and immediately before POST, then escalates and
does not POST if the attempt changed. This narrows the race but cannot
atomically bind the remote write to the approved attempt if another actor
reruns the workflow between that final read and POST. Keep
`run_attempt_write_binding_unavailable` as a hard live gate until a separately
reviewed design resolves that API limitation; the final read alone is not a
complete resolution.

The job API reports runtime job identities and statuses but does not report
the workflow's `needs` graph. The current writer allowlist stores only job
names, while the TTY review requires a complete graph. A future host must load
the graph from trusted reviewed configuration or parse the exact attested
workflow source; unknown dependencies or dynamic graphs remain blocked by
`trusted_job_graph_unavailable`.

The `feature/stage1-cli-rerun` change for PR #290 adds the dedicated Stage 1
target, prompt, source-attestation, and host suites to both the fixed local
verifier and hosted `loop-foundation.yml` test list. Treat these boundaries as
hosted-verified only when the workflow passes on the reviewed PR head.

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
collection limits, and the [workflow attestation proposal](../superpowers/specs/2026-10-05-stage1-workflow-attestation-design.md)
for the unresolved trust-provider design. No live Stage 1 pilot has run.
