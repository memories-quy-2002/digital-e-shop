# Stage 1 readiness evidence

**Updated:** 2026-10-12

**Status:** BLOCKED — the trusted-dispatch implementation is on `feature/stage1-trusted-dispatch`, but no live Stage 1 pilot has occurred. As of the current 2026-10-12 check, App permissions, the policy-reader environment, local trust identities and CLI are configured. PR #304 has green CI but still needs human review and merge. There is no eligible pilot PR and no per-PR budget session.

## Current configuration and PR check (2026-10-12)

The dedicated `digital-e-policy-reader` App is installed only on this
repository with Administration, Actions, Checks, Contents, Pull requests,
Commit statuses and implicit Metadata all read-only. Environment
`stage1-policy-reader` permits only `main`, requires reviewer
`memories-quy-2002`, blocks self-review, and contains the expected client ID
and encrypted private-key secret. Secret verification used GitHub metadata;
the secret value was not read back.

The `digital-e-loop-runner` App installation for this repository now grants
`actions:write` along with its reviewed read and Check Runs capabilities. The
user-local host config and trust identities are present, and GitHub CLI
2.102.0 is available. This config does not create a pilot budget or count as
pilot evidence.

PR [#304](https://github.com/memories-quy-2002/digital-e-shop/pull/304) is
open at head `dbb48a1bd7aeff46c630d66f10566448f014accb` against base
`d105b740f1514315dfd21fbad306e8a865a1994d`. Its 15 latest check runs are
completed with success or skipped conclusions, and the combined commit status
is successful. The PR is mergeable, but the review list has no human approval;
its workflow changes also make it ineligible for the recovery pilot. The only
open PR is #304. No eligible recovery target, dispatch, Check Run update, or
live pilot observation exists.

The repository's observed main branch protection reports zero required PR
approvals. The project workflow still requires a human review before merge;
do not infer that GitHub's mergeable state satisfies that requirement.

## Trusted dispatch retry implementation (2026-10-10)

The feature branch connects the fixed workflow dispatch to the trusted host,
typed approval, exact tuple revalidation, one-use finite-budget reservation,
source-attestation verification, exact returned-run observer, and a publisher
restricted to the original failed Check Run. Its fixed workflow has separate
`verify`, `attest`, and `publish` jobs; only `publish` receives `checks: write`.
The host's App installation needs `actions:write` to dispatch. Local unit and
static tests are implementation evidence only. No live recovery workflow,
cross-run Check Run update, or Stage 1 pilot has been observed. No App
permission, branch protection, or production configuration was changed.

## Implementation PR CI (2026-10-11)

[PR #304](https://github.com/memories-quy-2002/digital-e-shop/pull/304) at
`ed5a4fefd8bb8ab1852c96acd98490f4a91a677b` passed client/server, Loop Foundation,
dependency review, verify, and GitGuardian. CodeQL analysis jobs completed,
but the CodeQL gate reported a new high cache-poisoning alert in the recovery
workflow: dispatch on `main` retained a separate cache write capability while
executing PR code. This is normal PR CI evidence, not recovery-pilot proof.

The follow-up remediation sets workflow-wide `cache-mode: none` with a
regression contract that prevents job overrides from restoring cache access.
GitHub enforces it using scoped cache tokens; `contents: read` alone does not
limit cache writes. See the [cache access contract](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching#controlling-cache-access-with-cache-mode).
Hosted CodeQL on the remediation commit must be checked independently; this
document does not claim the alert is cleared or the live dispatch is proven.

## Local trust and budget prerequisites

The publisher now also requires freshly collected complete required-check
policy with the approved fingerprint and exact context/App ID before PATCH.
The local workflow now requests a repository-scoped read-only policy token
from the pinned official token action in environment `stage1-policy-reader`.
The Actions token is confined to the original Check Run PATCH. Missing/equal
tokens, denied reads, changed policy, incomplete evidence, or a changed PR
tuple refuse publication. Current provisioning is recorded above; local
implementation and configuration remain distinct from live hosted proof.
See the [pilot checklist](stage1-pilot-checklist.md).

## Read-only audit on 2026-10-12

The separate-reader implementation passed 405 local Loop tests across 31
suites and an independent read-only code review. Targeted tests first failed
on the prior transport/CLI behavior, then passed after the fix. They include
read/write token routing, unavailable/expired credentials, policy changes,
PR tuple changes, paginated rules and publisher-only credential isolation.
The local Node version was 24.21.0; hosted workflows remain pinned to 24.20.0.
These results are not live dispatch or promotion evidence.

The GitHub connector observed PR #304 open on exact head
`23d00d04ac74c1e2af81b3efa6e96e7c2717960a` and base
`d960cd0a3c6ff132560491cafc98dfa0e08f4726`. The Check Runs endpoint returned
14 entries on one page; every entry was completed with `success` or `skipped`.
Client/server, dependency-review, GitGuardian, Loop Foundation `test`, Worker
`verify`, CodeQL and all three analysis jobs reported success. The commit-status
endpoint also reported both Vercel preview statuses successful. The
[CodeQL Check Run](https://github.com/memories-quy-2002/digital-e-shop/runs/114350668385)
was observed successful; this audit did not independently read security-alert
disposition. These results cover that remote head only, not the newer local
publisher-policy/token changes. Hosted CI must run on their eventual revision.

The first review page contained only a bot `COMMENTED` review, with no human
approval. The open-PR list contained only #304; its workflow changes make it
ineligible as a Stage 1 recovery pilot. No pilot was selected. The REST PR
response reported `merge_commit_sha: null`; this audit does not infer a fresh
head/base/merge tuple from that value.

Connector branch-protection access returned HTTP 403 `Resource not accessible
by integration`. None of the four `LOOP_GITHUB_APP_*` host configuration names
used by the runbook were present in the process or Windows user environment;
the user-local trust file was absent. GitHub CLI was unavailable on PATH and
the checked standard installation paths. No private key, secret value,
installation token, App permission, branch protection, dispatch, or Check Run
write was accessed or changed. These are local/connector capability limits,
not proof that the repository owner's App installation lacks a permission.

## Local host configuration

The host reads trusted approver and workflow actor numeric IDs only from the
fixed user-local file documented in the [CLI runbook](stage1-cli-runbook.md).
It stores the per-PR finite-budget LoopState under the OS-resolved user home,
and canonicalizes both paths before each budget operation. It refuses to use
the session if the effective `<OS home>/.loop/state/` path is inside the PR
checkout, so checkout-local ignored state cannot become the budget ledger.
This does not isolate the store from other processes running as the same
operating-system account.
The trust loader resolves that fixed path through `os.userInfo().homedir`,
ignores `USERPROFILE`, and fails closed if the operating-system home is
unavailable or invalid. After review and merge, launch the CLI entrypoint from
a clean reviewed `main` checkout with the selected PR worktree as the current
directory; the runbook documents the PowerShell wrapper. This keeps executable
host modules on the reviewed revision while the host observes the PR checkout.
`initialize-budget` creates one local LoopState for the current PR base/head
tuple after typed TTY confirmation; dispatch refuses missing, corrupt, stale,
or exhausted state. This branch does not create the local file or grant App
permissions. The workflow must first be reviewed and merged before it can be
dispatched from `main`.

Before PR #302 was merged, its live read-only inspection returned
`ready-for-human` with all five required check identities matched and green on
head SHA `77dca7fd0f04b705182a669dd1d2254559e448c9`. The same snapshot reported
zero required workflow identities and an empty `workflowEvidence` array. This
is historical required-check evidence for that PR; it is not proof of the
workflow source-attestation path, trusted dispatch, Check Run publication, or
a Stage 1 pilot.

## Hosted Stage 0 promotion gates (snapshot from 2026-10-09)

| Gate | Evidence collected | Result |
| --- | --- | --- |
| At least 10 representative failed or pending observations | 0 of 10 in this run | Blocked |
| Cron sweep completion | Read-only D1 completion record `2026-10-09T01:30:36.918Z`; deployed source unverified | Observed record; pilot pending |
| Downstream Queue processing | No successful consumer completion observed; historical retry records are not current backlog evidence | Blocked |
| Check Run publication | Not independently observed | Blocked |
| Zero stale-SHA actionable decisions | No eligible observation set | Not assessed |
| Zero protected/infrastructure misclassifications | No eligible observation set | Not assessed |
| Bounded metadata without credentials, raw logs, or review bodies | No live Stage 1 observation set | Not assessed |

## Hosted diagnostics status (2026-10-09)

The diagnostic implementation passed local targeted checks: the source-SHA probe suite passed 13 tests; the Cloudflare package passed 2 portable Node tests, 87 Worker tests, and Worker typecheck, including the final verification run. These results validate local behavior and fixtures only. They are not hosted observations, root-cause evidence, or Stage 1 promotion evidence. The cross-suite Node verification passed 59 tests, and the documentation contract check passed 5 tests after the documentation update.

Unavailable probe results carry a fixed allowlisted `reasonCode`; the existing candidate-success result retains exactly seven keys. Refusals return a null candidate, and unavailable workflow path metadata is present only for the canonical `.github/workflows/loop-foundation.yml` path. Unknown error text is not emitted. Worker failures carry a fixed processing `stage` and allowlisted `reasonCode`; unknown codes map to `stage0_<stage>_failed`. Invalid PR/check normalization uses `pr_snapshot_invalid` or `check_observation_invalid`. Incomplete policy/check evidence retains its existing wait/unavailable behavior; diagnostics do not turn it green or change retry/ack behavior.

On 2026-10-09, a read-only D1 sample showed 258 historical retry records with reason `stage0_queue_processing_failed`, 0 PR-state rows, and 0 Check Run mappings. This is not current Queue backlog, a consumer root-cause finding, or pilot evidence. The scheduler `last_completed_at` value `2026-10-09T01:30:36.918Z` proves only that a sweep completed; it does not prove downstream consumption, publication, or deployed source identity. Do not infer automatic dead-letter replay.

The active Worker version `cce89ad4-8891-49c9-884e-c1fbfa9aa82f` was uploaded on 2026-10-06, but no commit-SHA attestation correlates it to source. The canonical policy parser's `highRiskActions` support merged on 2026-10-08; this policy drift is a separate deployment concern, not an established cause of probe or Queue failures. PR #300 exercised the GitHub workflow-source probe after PR #301 merged; its verified candidate is recorded below. Worker diagnostics still require a protected deployment and correlation of its source commit with the active Worker version. Stage 1 remains BLOCKED pending a write-capable pilot, representative observations, and all independent promotion gates.

The post-merge `main` push at `a3b998e26da1852b572bd07fd05ba1f403e351af` completed Loop Foundation run `37874576925`; its read-only source probe `37874653137` returned `probe_event_unsupported`. This is the expected refusal for a push without a same-repository PR association. The probe's bounded refusal diagnostics are working, but this run provides no positive source-SHA proof and does not count toward the Stage 1 pilot observations.

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

PR #293 merged this implementation to `main` at `c546532fbd4537c349f29b4600a3270fcef7d329`. It adds a deterministic run descriptor, an opt-in OIDC attestation producer, certificate verification with GitHub CLI, and verifier-owned source records for the read and rerun adapters. The downstream `workflow_run` probe checks the signed certificate against one same-repository PR and its current base/head/merge tuple. It ignores raw SHA fields and statement predicates. The later labeled control PR below did not produce a hosted candidate; keep the source-SHA gate closed until a subsequent hosted probe proves the exact run and PR tuple.

The first post-merge control run was not a PR event: `Loop Foundation` run `37742163945` completed on the main push, and read-only probe run `37742207061` returned `status: unavailable` with `sourceShaCandidate: null`. That is the expected fail-closed result for a push without a same-repository PR association. It confirms the no-candidate path only; it is not positive OIDC proof.

Do not infer the workflow source SHA from the tested SHA, workflow path, or ref. PR #300's hosted control probe below verified a candidate for one exact run attempt and PR tuple. That evidence concerns required-workflow observations. The trusted-dispatch workflow source is separately bound to the PR base SHA and must be verified from the exact returned workflow run; no live dispatch has tested that path.

## Historical attempt-bound rerun feasibility experiment

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

This establishes stale-job-ID behavior for the tested job-rerun endpoint only. PR #296 merged a guarded writer for that design, which the selected trusted-dispatch path does not call. This single test is historical feasibility evidence, not pilot evidence or authorization to enable Stage 1.

## Historical pilot/readiness snapshot (2026-10-09)

- The maintainer has not selected a same-repository, non-`main` pilot PR. The example PR number in the command below is intentionally not used.
- PR #289 merged the canonical finite `ciRunLimit: 2` policy. The current host now supports one-time, exact-tuple LoopState initialization, but no local budget session has been configured for a pilot.
- No live Stage 1 GitHub or Cloudflare observation set was collected in this run. Local fixtures and static code inspection are not promotion evidence.
- The legacy run/job-rerun endpoint is not called by the trusted-dispatch path. The host dispatches only the fixed workflow, and requires local trust identities, the App's `actions:write`, and an exact persisted budget session.
- The retry workflow defines fixed verifier, attestation, and publisher jobs. This branch has no hosted workflow result yet; static workflow tests are not evidence of hosted job results.
- The source-attestation adapters now accept only immutable records created by the verifier; raw API `sourceSha` and `sourceShaAttested` fields are ignored. PR #300 proves the hosted producer-to-probe path for one tuple. Stage 1 `inspect` now configures the verifier with a separate repository-scoped `source-attestation:read` token; the installed App must grant `Attestations: read`. This does not make the probe candidate a Stage 1 host trust record, and live App-backed inspection has not yet been verified.
- PR #291's hosted `Loop Foundation` test passed on the reviewed PR head ([run 37417234608](https://github.com/memories-quy-2002/digital-e-shop/actions/runs/37417234608)); the post-merge `Loop Foundation` run also passed with the new probe suite ([run 37418888640](https://github.com/memories-quy-2002/digital-e-shop/actions/runs/37418888640)).
- The Phase 2 runbook documents one earlier `inspect` result for PR #264 on 2026-09-30. It returned `wait` for missing required-check evidence on the selected merge SHA, but the summary does not contain the complete observation tuple required by this plan; it is historical context and is not counted toward the 10 observations.
- A cron `last_completed_at` value alone would not prove Queue consumption or Check Run publication. Each requires its own current evidence.

## Historical refusal check (2026-10-08)

On 2026-10-08, `node --test scripts/loop/__tests__/pr-babysitter-stage1-host.test.mjs` passed all 10 tests. The tests confirm the Stage 1 host refuses while trust configuration or a persisted CI budget session is missing, and makes no network request on that path.

A TTY invocation of `rerun-flaky` on 2026-10-08 returned `stage1_prerequisites_unavailable` with the then-current five blockers, including `run_attempt_write_binding_unavailable`. It exited before credentials or GitHub access. The invocation used PR number `294` only to exercise the early refusal; the host did not inspect PR #294, and the result does not count as a pilot observation.

## Post-merge labeled OIDC control probe

On 2026-10-08, the labeled, same-repository documentation PR [#297](https://github.com/memories-quy-2002/digital-e-shop/pull/297) triggered producer run [37751138161](https://github.com/memories-quy-2002/digital-e-shop/actions/runs/37751138161). Both the test and `attest-workflow-source` jobs succeeded. The downstream read-only probe [37751216313](https://github.com/memories-quy-2002/digital-e-shop/actions/runs/37751216313) completed but returned `status: unavailable` and `sourceShaCandidate: null`.

A local read-only reproduction against that run, using the local GitHub CLI credentials, returned a candidate for merge SHA `f72200832dad8deb752a7a2b2d97edc943417c61`. Those credentials differ from the probe workflow's `GITHUB_TOKEN`, so this local result is diagnostic only and does not establish hosted proof. The hosted probe discrepancy remains unresolved; no verifier-owned trust record was produced and no Stage 1 observation was collected.

The successful producer and local reproduction did not replace hosted proof. The positive hosted result is now recorded below; it does not replace a write-capable pilot or the 10-observation readiness set.

## Hosted source-attestation probe after PR #301

PR #301 merged the provider-wiring fix to `main` at `b2eac302b25e14a2ab91f10fe294069258541010`. The fix passes the attestation provider's inspection method to the probe. The push-triggered Loop Foundation run [37879962486](https://github.com/memories-quy-2002/digital-e-shop/actions/runs/37879962486) succeeded, and its downstream probe [37879992545](https://github.com/memories-quy-2002/digital-e-shop/actions/runs/37879992545) returned `probe_event_unsupported`, as expected for a push without a PR association.

The labeled, same-repository documentation PR [#300](https://github.com/memories-quy-2002/digital-e-shop/pull/300) then triggered producer run [37880095649](https://github.com/memories-quy-2002/digital-e-shop/actions/runs/37880095649), attempt 1. Its `test` and `attest-workflow-source` jobs succeeded. Probe run [37880149123](https://github.com/memories-quy-2002/digital-e-shop/actions/runs/37880149123) returned `status: candidate_present` for workflow `368298853`, path `.github/workflows/loop-foundation.yml`, tested SHA `c765a06ddea0909b08b11240302b661e7b5bf33c`, and candidate `fc5a6d82fb5260bd2832edf7aaba82ac9ad80c18`. The probe accepted the signed claims for that exact run attempt and PR tuple; the candidate differs from the tested SHA.

The first positive result used PR #300's pre-sync base SHA `a3b998e26da1852b572bd07fd05ba1f403e351af`. After updating the PR branch to `main`, a fresh producer run [37880386485](https://github.com/memories-quy-2002/digital-e-shop/actions/runs/37880386485), attempt 1, passed both `test` and `attest-workflow-source`. Probe run [37880432607](https://github.com/memories-quy-2002/digital-e-shop/actions/runs/37880432607) returned `status: candidate_present` for base `b2eac302b25e14a2ab91f10fe294069258541010`, head `e34cc5cf316ac563ec75fb3a68650fb2b987b4c0`, merge `c34e8cdfd3d41f65468e93d80ae18913238aa914`, and tested SHA `e34cc5cf316ac563ec75fb3a68650fb2b987b4c0`. The verified candidate was `c34e8cdfd3d41f65468e93d80ae18913238aa914`, matching the merge SHA and differing from the tested head SHA. The probe validated the signed claims for the exact run attempt and PR tuple.

This current-tuple result proves the hosted producer-to-probe path can verify a source-attestation candidate. It does not create a Stage 1 host trust record, authorize a rerun, count as a pilot observation, or satisfy any other promotion gate.

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

After review and merge, select a same-repository non-`main` pilot PR and run
`inspect` using the trusted-main invocation in the [CLI runbook](stage1-cli-runbook.md),
with the matching PR worktree as its current directory. Confirm current
required-check and workflow evidence before initializing the local budget
session. Configure the local trust file and separately approve the GitHub
App's `actions:write` permission before invoking `rerun-flaky` in a real TTY.
Preserve `wait` and `escalate` as decisions, not infrastructure failures.
Record only bounded IDs, SHA values, status, classification, reason code, and
evidence kind.

PR #300 is the same-repository control PR for the opt-in producer and downstream probe. Its latest accepted result is recorded above. This proves only source identity for that exact run attempt and PR tuple. Local trusted approver/actor configuration, App `actions:write`, an initialized budget session, hosted trusted-dispatch evidence, and cross-run Check Run behavior remain separate blockers.

Do not enable Stage 1, change the canonical policy, or change GitHub App permissions from this report. Continue to require reviewed workflow-source attestation, a reviewed complete job allowlist, and a host-managed persisted session bound to the finite canonical CI budget.
