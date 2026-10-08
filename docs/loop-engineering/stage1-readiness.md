# Stage 1 readiness evidence

**Updated:** 2026-10-08

**Status:** BLOCKED — no write-capable Stage 1 pilot PR was selected and no live rerun observations were collected. The OIDC source-attestation control run below is read-only feasibility evidence and does not qualify the repository for a Stage 1 pilot.

## Promotion gates

| Gate | Evidence collected | Result |
| --- | --- | --- |
| At least 10 representative failed or pending observations | 0 of 10 in this run | Blocked |
| Cron sweep completion | Not independently observed | Blocked |
| Downstream Queue processing | Not independently observed | Blocked |
| Check Run publication | Not independently observed | Blocked |
| Zero stale-SHA actionable decisions | No eligible observation set | Not assessed |
| Zero protected/infrastructure misclassifications | No eligible observation set | Not assessed |
| Bounded metadata without credentials, raw logs, or review bodies | No live Stage 1 observation set | Not assessed |

## Source-SHA feasibility probe

The legacy read-only probe added by PR #291 ran after merge. It found no upstream source-SHA field in the GitHub event or matching run response. That result motivated the OIDC design; it is not an attestation, pilot observation, or authorization to rerun Actions.

| Field | Observed value |
| --- | --- |
| Repository ID | `743050379` |
| Workflow ID and path | `368298853` — `.github/workflows/loop-foundation.yml` |
| Upstream run ID / attempt | `37418888640` / `1` |
| Tested SHA | `f32bab895e4ad8bf7bc6f5f3dc3dbb0ed954a126` |
| Legacy probe result | `source_sha_unavailable` |
| Legacy event/API source-SHA candidates | `null` / `null` |
| Evidence runs | [Loop Foundation](https://github.com/memories-quy-2002/digital-e-shop/actions/runs/37418888640), [source SHA probe](https://github.com/memories-quy-2002/digital-e-shop/actions/runs/37418918573) |

PR #293 merged this implementation to `main` at `c546532fbd4537c349f29b4600a3270fcef7d329`. It adds a deterministic run descriptor, an opt-in OIDC attestation producer, certificate verification with GitHub CLI, and verifier-owned source records for the read and rerun adapters. The downstream `workflow_run` probe checks the signed certificate against one same-repository PR and its current base/head/merge tuple. It ignores raw SHA fields and statement predicates. Positive hosted proof still requires a later labeled, open, same-repository PR.

The first post-merge control run was not a PR event: `Loop Foundation` run `37742163945` completed on the main push, and read-only probe run `37742207061` returned `status: unavailable` with `sourceShaCandidate: null`. That is the expected fail-closed result for a push without a same-repository PR association. It confirms the no-candidate path only; it is not positive OIDC proof.

Do not infer the workflow source SHA from the tested SHA, workflow path, or ref. Keep `workflow_source_sha_unattested` as a hard refusal until a hosted certificate proves the source SHA for the exact run attempt and PR tuple. Stage 1 remains disabled.

## Attempt-bound rerun feasibility experiment

A controlled Actions test on the same-repository, non-`main`, documentation-only PR #294 established that a job ID from an older attempt is rejected after a newer attempt becomes current. The test used the `Loop Foundation` workflow only; no deployment job ran.

| Field | Observed value |
| --- | --- |
| PR head SHA | `eff3fc4fb1602dd5eaf2313befb7109d8fa0b04b` |
| Workflow run | `37714893275` |
| Attempt 1 job ID | `113109016799` (`test`) |
| Attempt 2 job ID | `113182145888` (`test`) |
| Attempt 2 result | `success` |
| Re-submit attempt 1 job ID | HTTP `403`: `Only jobs from the current attempt can be re-run` |
| Final run attempt | `2` (no third attempt was created) |

This resolves the stale-job-ID behavior for the tested job-rerun endpoint: a previous-attempt job ID did not start another run. PR #296 merged the guarded-writer change that targets exactly one job ID from the complete, approved attempt-specific response. The standalone Stage 1 host remains fail-closed until its capability gate is reviewed against that writer and the independent trust gates are met. This single test is feasibility evidence, not pilot evidence or authorization to enable Stage 1.

## Collection limits

- The maintainer has not selected a same-repository, non-`main` pilot PR. The example PR number in the command below is intentionally not used.
- PR #289 merged the canonical finite `ciRunLimit: 2` policy. The Stage 1 host still has no persisted LoopState session loaded and validated against that revision, so it reports `ci_run_budget_session_unavailable` and refuses live reruns.
- No live Stage 1 GitHub or Cloudflare observation set was collected in this run. Local fixtures and static code inspection are not promotion evidence.
- The run-level failed-jobs endpoint does not bind a write to `run_attempt`. PR #296 merged the guarded-writer change to submit exactly one attempt-scoped root job ID, and the controlled test above found that GitHub rejects a previous-attempt ID once a newer attempt is current. The standalone Stage 1 host still reports `run_attempt_write_binding_unavailable` and refuses live writes until that host capability gate is reviewed and reconciled with the writer.
- The GitHub job response does not provide the workflow `needs` graph, and current trusted configuration has no approved graph. `trusted_job_graph_unavailable` remains a hard gate until each eligible workflow has a complete reviewed graph.
- The source-attestation adapters now accept only immutable records created by the verifier; raw API `sourceSha` and `sourceShaAttested` fields are ignored. The Stage 1 host still does not configure the provider, and hosted producer-to-probe proof remains pending. Do not count local fixtures as hosted evidence.
- PR #291's hosted `Loop Foundation` test passed on the reviewed PR head ([run 37417234608](https://github.com/memories-quy-2002/digital-e-shop/actions/runs/37417234608)); the post-merge `Loop Foundation` run also passed with the new probe suite ([run 37418888640](https://github.com/memories-quy-2002/digital-e-shop/actions/runs/37418888640)).
- The Phase 2 runbook documents one earlier `inspect` result for PR #264 on 2026-09-30. It returned `wait` for missing required-check evidence on the selected merge SHA, but the summary does not contain the complete observation tuple required by this plan; it is historical context and is not counted toward the 10 observations.
- A cron `last_completed_at` value alone would not prove Queue consumption or Check Run publication. Each requires its own current evidence.

## Static Stage 0 source audit

This audit describes what the local source is designed to do; it is not evidence
that the deployed Worker, Queue, D1 database, or GitHub App completed these
steps during this run.

- The [scheduled handler](../../scripts/loop/hosted/cloudflare/src/handlers/scheduled.ts)
  pages through open PRs under a scheduler lease and sends one bounded Queue
  message per PR. It writes `lastCompletedAt` only after the final page has
  enqueued successfully; a capped partial sweep returns `incomplete` and leaves
  the previous completion time unchanged. This proves only the local
  reconciliation/enqueue path, not consumer completion.
- The [Queue consumer](../../scripts/loop/hosted/cloudflare/src/handlers/queue.ts)
  registers an idempotent delivery, claims a PR lease, observes GitHub, stores
  bounded PR state, and publishes the neutral report only when required-check
  policy evidence is complete. It records a check-run mapping after publication
  and marks the delivery processed afterward. Failures set retry metadata and
  call Queue retry. Because incomplete policy skips publication but can still
  reach processed status, `processed` alone does not prove a Check Run exists.
- The [D1 adapter](../../scripts/loop/hosted/cloudflare/src/storage/d1.ts)
  stores delivery status, PR state, report mappings, and reconciliation cursor.
  For a live publication claim, collect the matching delivery record and
  mapping for the observed PR head SHA, then independently read the GitHub
  Check Run and verify its app ID, name, and exact `head_sha`.
- The [report client](../../scripts/loop/hosted/cloudflare/src/github/report-client.ts)
  publishes the fixed report with `conclusion: neutral`; this is an observation
  signal and never evidence that required CI passed or that promotion is ready.

Required live evidence remains empty in this run. These code paths and their
fixtures support the collection procedure; they do not count toward the ten
representative observations or any hosted promotion gate.

## Required collection format

Add one row per fresh observation only after the maintainer selects the pilot PR and the read-only host can reach GitHub. Use `null` only when the source itself reports a missing field; never infer SHA or identity values.

| observedAt | repositoryId | prNumber | baseSha | headSha | mergeSha | testedSha | requiredIdentity | outcome | classification | reasonCode | evidenceKind |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |

## Next evidence step

Run `node scripts/loop/pr-babysitter-host.mjs inspect --repo memories-quy-2002/digital-e-shop --pr <maintainer-selected-pr>` from its matching clean PR checkout. Preserve `wait` and `escalated` as decisions, not infrastructure failures. Record only bounded identifiers, SHA values, status, classification, reason code, and evidence kind.

After the implementation is reviewed and merged, use a later same-repository PR that does not change `.github/workflows/loop-foundation.yml` to exercise the opt-in producer and downstream probe. A maintainer applies `loop-stage1-attestation-pilot`; confirm the certificate binds the exact run attempt and PR tuple, and that `githubWorkflowSHA` differs from the tested SHA. This proves only source identity. The workflow/job graph, trusted approver, host-managed budget session, and run-attempt write binding remain separate blockers.

Do not enable Stage 1, change the canonical policy, or change GitHub App permissions from this report. Continue to require reviewed workflow-source attestation, a reviewed complete job allowlist, and a host-managed persisted session bound to the finite canonical CI budget.
