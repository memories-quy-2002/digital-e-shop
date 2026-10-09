# Loop hosted diagnostics design

Date: 2026-10-09
Status: Approved by the maintainer on 2026-10-09, including the seven exact
high-risk paths below. Implementation uses Luna subagents.

## Goal and evidence

Identify where the hosted workflow-source probe and Stage 0 Cloudflare consumer
fail, without changing verification, authorization, retry budgets, or decisions.
This is diagnostic work, not a claim that Stage 1 is ready.

- Probe run 37751216313 returned `unavailable` for producer 37751138161.
  Local verification of its historical descriptor succeeds with gh 2.102.0,
  including the repository provider. Local credentials are not the hosted token.
- Active Cloudflare version cce89ad4-8891-49c9-884e-c1fbfa9aa82f was uploaded
  on 2026-10-06. Its metadata does not establish a source commit. The repository
  parser added `highRiskActions` support on 2026-10-08 in PR #295.
- A read-only D1 sample on 2026-10-09 found 258 delivery records in `retry`
  with `stage0_queue_processing_failed`, no PR state, and no Check Run mapping.
  These are historical records, not a measurement of current Queue backlog.
  A completed scheduler sweep does not prove consumer or publisher completion.
- Current local evidence after Tasks 1 and 2: 2 portable Node tests, 87 Worker
  tests, and Worker typecheck pass; the focused probe suite passes 12 tests. The
  cross-suite verification passed 58/58; the updated documentation contract
  passed 5 tests. Neither consumer root cause nor hosted
  attestation discrepancy has been established. Policy drift is a separate
  deployment concern.

## Design choice

Use bounded reason codes at existing component boundaries. This gives more
useful evidence than another generic retry, while avoiding raw event/response
logging. Do not fix a suspected runtime cause until these diagnostics identify
the failing boundary. Do not introduce a telemetry service or dependency.

## Probe contract

Retain existing validated IDs/SHAs, verification guards, status values, and the
candidate-success shape. Unavailable path metadata is the canonical fixed
`.github/workflows/loop-foundation.yml` only when the sampled path equals that
value; otherwise it is null, so malformed event text is never echoed.
Add `reasonCode` only to unavailable results.
It is a fixed enum, never derived from exception text or response content:

- `probe_identity_mismatch`: repository/workflow/path comparison failed.
- `probe_run_mismatch`: run ID, attempt, SHA, or head branch comparison failed.
- `probe_event_unsupported`: the source event is not a pull request.
- `probe_pr_lookup_invalid`: malformed branch or PR response collection.
- `probe_pr_lookup_incomplete`: pagination prevents a complete observation.
- `probe_pr_missing` / `probe_pr_ambiguous`: zero or multiple same-repo PRs.
- `probe_pr_tuple_mismatch`: required PR IDs/SHAs/branch do not bind the run.
- `probe_run_timestamps_invalid`: run timestamps are missing or inconsistent.
- `probe_descriptor_invalid`: deterministic descriptor creation failed.
- `probe_attestation_provider_unavailable`: no callable provider.
- `probe_attestation_failed`: an unrecognized provider error.
- `probe_claims_mismatch`: returned claims fail the existing complete matcher.

Known provider error codes already enumerated by the CLI may be emitted exactly
as listed there (for example `attestation_cli_failed`). Share a fixed error-code
normalizer between the core and CLI so unknown errors never introduce strings
into telemetry. Existing CLI HTTP/event errors retain their exit behavior;
unavailable evidence still returns success at the process level and cannot
become trusted proof. Ignored foreign events continue producing no output.

## Worker contract

Add fixed processing-stage metadata to consumer failure logs. Stages are
`register_delivery`, `claim_lease`, `observe`, `normalize_snapshot`, `load_state`,
`reconcile_state`, `save_state`, `decide`, `load_report_mapping`, `publish_report`,
`save_report_mapping`, and `mark_processed`. Each stage maps to a fixed fallback
reason code `stage0_<stage>_failed` when the exception has no recognized code.

Replace the current regex-only acceptance of arbitrary exception `.code` with
an explicit allowlist of the GitHub API/auth, D1 storage, and Queue error codes
already defined by those modules. Do not emit `.message`, stack, cause, request
URL, bodies, tokens, or raw claims. Unknown syntactically plausible codes use
the stage fallback. A bounded diagnostic error may carry only `code` and
`stage`; preserve recognized codes and existing retry/ack/lease behavior.

Inside the observer, distinguish invalid PR snapshot normalization and invalid
check-evidence normalization with fixed typed codes. Transport errors retain
their existing recognized codes. Caught incomplete policy/check evidence keeps
its existing wait/unavailable handling; diagnostics must not convert it into a
throw, an empty complete policy, or a green workflow.

Persist only the bounded reason code in the existing delivery `reason_code`
column. No D1 migration or new state schema. Failure recording remains best
effort; it must not replace the original diagnostic if D1 fails too. A record
that was never registered cannot be presumed persisted.

## Exact implementation scope and classification

The following seven paths match the high-risk `scripts/loop/**` rule and require
human approval for this proposal before any code/test write:

1. `scripts/loop/stage1-source-sha-probe.mjs`
2. `scripts/loop/stage1-source-sha-probe-cli.mjs`
3. `scripts/loop/__tests__/stage1-source-sha-probe.test.mjs`
4. `scripts/loop/hosted/cloudflare/src/handlers/queue.ts`
5. `scripts/loop/hosted/cloudflare/src/github/observer.ts`
6. `scripts/loop/hosted/cloudflare/test/queue-consumer.test.ts`
7. `scripts/loop/hosted/cloudflare/test/github-adapter.test.ts`

Low-risk documentation: this spec and its matching plan; the Stage 0 runbook,
Stage 1 readiness guide, `Wiki/concepts/loop-engineering.md`, `Wiki/index.md`,
and `Wiki/log.md`. No workflow YAML, policy, App permissions, dependencies,
database schema, source-attestation verifier, or application-package changes.
An additional code path requires an explicit scope update before editing it.

## Acceptance criteria

- AC1: Each existing probe refusal has a deterministic allowlisted reason;
  valid evidence retains its original candidate result and exact SHA binding.
- AC2: Worker failures identify the component stage, and recognized error codes
  survive. The same boundary failure still retries rather than acknowledging.
- AC3: Sentinel secrets in messages, stack/cause, `.code`, event payloads, and
  response content do not appear in probe output, Worker logs, or stored reasons.
- AC4: Tuple freshness, policy completeness, corrupted-state refusal, report
  transport restrictions, neutral conclusion, bounded retries, and lease
  release remain intact. Tests retain all prior assertions.
- AC5: Documentation distinguishes local tests, historical D1 records, scheduler
  completion, consumer completion, and hosted proof. Stage 1 remains blocked.

## Verification and rollout

Run targeted probe tests; all Worker tests and typecheck; the existing workflow,
verifier-routing, and runbook contract tests. Review the complete diff for
diagnostic-only scope and any string that can reach logs/storage.

Use one PR containing probe and Worker diagnostics. Preserve the user's earlier
subagent-driven execution preference with Luna agents once scope is approved.
Work on this branch in the existing checkout; do not create another worktree.

After maintainer review/merge, deployment is a separate human-controlled step
through the existing protected Stage 0 workflow. Record source commit, active
version, bindings, and tests together; do not claim a version timestamp proves
its source. No deployment, Queue redelivery/purge, secret change, or remote D1
mutation belongs to implementation.

A 2026-10-09 read-only D1 sample found 258 historical retry records with
`stage0_queue_processing_failed`, no PR-state records, and no Check Run
mappings. This dated sample is not current backlog, cause proof, or pilot
evidence. Scheduler completion at `2026-10-09T01:30:36.918Z` does not prove
consumer completion or publication. The active version
`cce89ad4-8891-49c9-884e-c1fbfa9aa82f` was uploaded on 2026-10-06 without a
commit-SHA attestation. The downstream workflow-run probe uses trusted
default-branch code, so a PR containing diagnostics does not itself prove the
new hosted probe. After separately reviewed merge and approved protected
deployment, correlate source commit and active version, then exercise a fresh
eligible PR and inspect bounded evidence. Fix only a demonstrated cause in
subsequent work. Do not promise full Stage 1 qualification from a diagnostic PR.
