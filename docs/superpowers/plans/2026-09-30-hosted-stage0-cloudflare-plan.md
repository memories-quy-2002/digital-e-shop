# Hosted Stage 0 PR Observer on Cloudflare

> **For future implementation:** Execute the policy gate first, then work through the tasks in order. Keep the Worker report capability separate from the read-only PR observer. Do not deploy App credentials to a preview environment.

**Goal:** Run Loop Engineering Stage 0 from hosted infrastructure and show a bounded, non-gating observation report in the GitHub pull request Checks tab.

**Selected platform:** Cloudflare Workers Free, Cloudflare Queues Free, and D1 Free. The published limits checked on 2026-09-30 distinguish ordinary HTTP Worker invocations (100,000 requests/day, 10 ms CPU/invocation, and at most 50 subrequests on Free) from Queue consumers (30 seconds CPU by default, configurable up to 5 minutes; CPU is active processing time). Queues allow 10,000 operations/day on Free and retain messages for 24 hours. D1 allows 5 million row reads and 100,000 row writes per day. Queue retries consume operations; a typical delivered message uses three Queue operations before retries. Recheck quotas and consumer configuration before deployment, and leave headroom for retries and scheduled reconciliation. The observer is best-effort; it must fail closed when an event, quota, or evidence collection is unavailable.

References: [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [Queue limits](https://developers.cloudflare.com/queues/platform/limits/), [Queues pricing](https://developers.cloudflare.com/queues/platform/pricing/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [GitHub failed webhook deliveries](https://docs.github.com/en/webhooks/using-webhooks/handling-failed-webhook-deliveries).

## Design

1. A dedicated Cloudflare Worker receives GitHub webhooks. It verifies the raw request body with `X-Hub-Signature-256`, checks the configured repository ID and event/action allowlist, and queues only bounded routing metadata. It responds promptly after enqueueing. Invalid requests are rejected; enqueue failures return non-2xx and produce bounded diagnostics. GitHub does not automatically redeliver failed webhook deliveries, so webhook traffic is a low-latency wake-up signal, not the correctness mechanism.
2. A scheduled reconciliation handler periodically enumerates the configured repository's open PRs and enqueues bounded routing metadata for a current-state observation. It uses a persisted, resumable cursor and strict per-run page/subrequest limits so every open PR is revisited over a measured interval. A partial or failed sweep remains incomplete and resumes later; it never implies green evidence.
3. A Queue consumer fetches the current PR snapshot from GitHub, loads canonical Loop policy at the exact current `baseSha`, collects required-check evidence for the current head/merge SHA tuple, and invokes the existing Phase 2A decision contract. It never checks out or executes PR code.
4. D1 stores short-lived webhook delivery dedupe records, the Check Run ID associated with the current repository/PR/head, and bounded reconciliation progress. It contains IDs, SHA values, policy fingerprints, stable reason codes, timestamps, cursors, and processing state only. Queue redelivery and consumer retries must be idempotent.
5. A distinct report publisher creates or updates one `Loop Engineering Stage 0` Check Run on the exact observed head SHA. It reports a bounded action/reason code and timestamp with `neutral` conclusion. The context is not a required check. A preflight and each policy refresh must refuse publication if that context is required by repository rules. The summary must say that the result is an observation and must not imply merge approval.
6. Required-workflow evidence remains unavailable until the existing trusted source-SHA attestation contract is satisfied. A stale tuple, incomplete collection, missing policy, unsupported policy, quota exhaustion, or host error never becomes ready-to-merge evidence.

### GitHub App permissions

Use the dedicated GitHub App, restricted to the one configured repository. Retain the read permissions needed for metadata, pull requests, checks, Actions, and rulesets; add `contents:read` to load policy at `baseSha`; add `checks:write` only for the selected PR Check Run report. Do not grant `actions:write` or `contents:write`.

GitHub's `checks:write` permission also covers re-request operations. The report adapter must have a fixed method/path allowlist for Check Run creation and update, with tests rejecting re-request endpoints. It must not expose a generic GitHub write client. The exact permission limitation and the non-required Check Run guard must be documented before installation changes.

## Non-goals and safety invariants

- No Actions rerun, code repair, branch push, merge, issue/comment write, or operation against Digital-E commerce production systems through this host. Provisioning or deploying this control-plane Worker to Cloudflare production is a separate infrastructure operation and requires explicit maintainer approval at execution time; code implementation or PR merge alone does not authorize it.
- No `pull_request_target` workflow and no checkout or execution of PR-controlled source.
- No App private key, webhook secret, installation token, or Cloudflare deploy token in source control, D1, logs, or PR payloads.
- No persistence of prompts, PR/review/comment bodies, signed URLs, or raw/unbounded CI logs.
- The report Check Run is not a required check and cannot authorize merge. Human review and merge remain mandatory.
- The local `scripts/loop/pr-babysitter-host.mjs inspect` path remains read-only and supported.
- If a host write is enabled, re-read and compare the repository/PR `{baseSha, headSha, mergeSha}` immediately before publishing. Discard stale decisions.
- Worker secrets and production Queue/D1 bindings are available only to the trusted production deployment from `main`. Preview builds and pull-request jobs receive no runtime App credentials.
- The Worker cannot provision or deploy itself, change commerce production, or treat a scheduled reconciliation as authorization to publish stale/incomplete evidence.

## Implementation plan

### Task 0: Review the report-only policy change separately

**Files:** `AGENTS.md`, `docs/loop-engineering/phase-2-pr-babysitter-runbook.md`, a new concise ADR under `Wiki/decisions/`, `Wiki/index.md`, and `Wiki/log.md`.

- [ ] Amend the Loop Engineering contract to define the hosted observer as read-only and the Check Run publisher as a separate, narrowly allowlisted report-only capability.
- [ ] State the exact `checks:write` limitation, the forbidden re-request/rerun operations, the `neutral` conclusion, and the invariant that the report context is never required.
- [ ] Document that this policy change is reviewed and merged on its own before any host implementation starts; begin implementation as a fresh run from the reviewed policy revision.
- [ ] Update the wiki decision and index/log according to repository wiki rules.

**Gate:** Do not proceed to implementation until this policy change has passed its own review and merge. Do not change policy and immediately execute host work under that same run.

### Task 1: Separate portable decision contracts from local filesystem state

**Files:** `scripts/loop/pr-babysitter.mjs`, `scripts/loop/pr-state.mjs`, focused shared modules under `scripts/loop/`, and their tests.

- [ ] Identify the pure validation and decision functions used by `decidePrAction`.
- [ ] Separate PR-state schema validation from `node:fs/promises` persistence so the hosted Worker can use the same state contract without importing local filesystem code.
- [ ] Keep local state file locking, permissions, and atomic persistence in the Node host adapter.
- [ ] Preserve existing CLI behavior and validate that both the Node path and Worker path produce identical decisions for shared fixtures.
- [ ] Keep decision input bounded and schema-validated; do not accept caller-supplied attestations or policy as authenticated host facts.

### Task 2: Add an isolated Cloudflare Worker package

**Files:** new `scripts/loop/hosted/cloudflare/` package, including its package manifest/lockfile, Wrangler configuration, Worker entrypoint, and package-local tests.

- [ ] Use the repository's pnpm-only, independent-package convention. Keep Cloudflare configuration and dependencies out of the commerce client/server packages.
- [ ] Bind the production Queue and D1 database only to the production Worker environment. Do not put secrets in checked-in Wrangler variables.
- [ ] Keep the Worker entrypoint small and route webhook ingress, Queue consumption, and scheduled reconciliation to separate modules.
- [ ] Use Web Crypto and Fetch APIs in the Worker. Do not import the current host/adapter modules that depend on `node:fs`, `node:child_process`, or `node:zlib`.
- [ ] Define bounded request, response, pagination, and subrequest limits below Cloudflare Free limits; return incomplete/unavailable evidence when a cap is reached.

### Task 3: Implement signed webhook ingress and event queueing

**Files:** Worker webhook handler, queue producer, configuration validation, and focused tests.

- [ ] Verify GitHub's HMAC-SHA256 signature against the raw body before parsing JSON; compare signatures safely.
- [ ] Require the expected GitHub event, supported action, repository ID, and PR number. Ignore the Worker's own Check Run events using its app ID and check name.
- [ ] Enforce a body-size cap and enqueue only delivery ID, event/action, repository ID, PR number, and receipt time.
- [ ] Return success only after enqueue succeeds. If enqueue fails, return non-2xx and emit bounded diagnostics; do not assume GitHub automatically redelivers failed webhooks. The scheduled reconciliation path must recover missed wake-ups.
- [ ] Test invalid signatures, malformed/oversized payloads, unsupported actions, wrong repositories, duplicate deliveries, Queue failures, and recovery by scheduled reconciliation.

### Task 4: Add a Cloudflare-compatible GitHub App and observation adapter

**Files:** Worker GitHub auth/API adapter and mocked API tests.

- [ ] Sign short-lived GitHub App JWTs with Web Crypto RS256 from a Worker secret; mint repository-restricted installation tokens with only the approved read/report permissions.
- [ ] Fetch the PR tuple, required-check/ruleset policy, check observations for head and verified merge SHA, workflow evidence, changed-file metadata, and review counts through fixed GitHub API routes.
- [ ] Fetch policy contents using the exact `baseSha`; validate the schema and compute its fingerprint in the host.
- [ ] Reuse the shared normalizers and decision contract from Tasks 1-2. Do not use GitHub payload fields as current evidence.
- [ ] Keep required workflow evidence unavailable until `{repositoryId, path, ref, sourceSha}` matches a trusted SHA attestation.
- [ ] Do not download job-log archives in Stage 0. Bound every API response and page count; reject redirects for authenticated calls; keep endpoint and permission use explicit.
- [ ] Test token scopes, redirects, pagination drift, missing/duplicate evidence, head/merge SHA binding, unsupported ruleset policy, and API failures.

### Task 5: Add D1 idempotency and Queue consumer orchestration

**Files:** D1 migration, Worker repository, Queue consumer, and tests.

- [ ] Create tables with unique keys for GitHub delivery IDs and for the PR/head Check Run mapping. Add expiration timestamps and bounded cleanup for delivery records.
- [ ] Model consumer processing/retry state so duplicate delivery and retry can safely resume after interruption.
- [ ] Add scheduled reconciliation for open PRs with a persisted cursor, a bounded page/subrequest budget, and a documented maximum revisit interval. Resume incomplete sweeps on later invocations; treat missed webhook events as expected and recover through the sweep.
- [ ] Serialize report work per repository/PR/head or use a lease so concurrent events cannot create duplicate Check Runs.
- [ ] Re-fetch the current PR tuple before final decision and immediately before Check Run publication. Drop or requeue work if it changed.
- [ ] Configure retry count, bounded backoff, and a dead-letter queue. Alert through bounded Cloudflare logs when messages are exhausted or evidence is unavailable.
- [ ] Test D1 errors, duplicate Queue delivery, concurrent events, expired leases, consumer restart, Queue retries, dead-letter behavior, missed-webhook recovery, cursor resume, partial sweeps, and daily free-tier budget handling.

### Task 6: Add the report-only Check Run capability

**Files:** fixed GitHub report client, ruleset guard, policy tests, and App setup documentation.

- [ ] Implement only `GET` for finding the existing app-owned report and the Check Runs create/update endpoints. Reject all other write paths, especially re-request/rerun paths.
- [ ] Publish against the exact current PR head SHA, with a stable name and bounded summary containing observation time, action, reason code, and policy fingerprint prefix.
- [ ] Use `neutral` for every report; never use success as a signal that the PR is mergeable.
- [ ] Before every publish, verify the report check name is absent from current required-check policy. If it is required or policy collection is incomplete, refuse publication and emit a bounded error.
- [ ] Update an existing report Check Run for the same PR/head where possible. Use D1 mapping plus a lookup recovery path to handle a retry after GitHub accepted a create but D1 did not record its ID.
- [ ] Add tests proving the correct SHA, non-required context, neutral conclusion, bounded output, stale-tuple refusal, and zero rerun/push/merge requests.
- [ ] Record the broader `checks:write` permission tradeoff and require the maintainer to confirm App installation permission changes during deployment.

### Task 7: Wire fixed verification, deployment, and operator documentation

**Files:** Worker test configuration, `scripts/loop/verify.mjs` and its harness test, a new hosted Stage 0 runbook under `docs/loop-engineering/`, GitHub Actions deployment workflow, scheduled-trigger configuration, and relevant Wiki pages.

- [ ] Add Worker typecheck/unit/runtime tests to the fixed verifier; keep local Node CLI tests in the fixed list.
- [ ] Deploy production only from trusted `main`. PR validation must not receive `CLOUDFLARE_API_TOKEN`, App credentials, webhook secret, or production bindings. Do not use `pull_request_target`.
- [ ] Store `GITHUB_APP_PRIVATE_KEY` and `GITHUB_WEBHOOK_SECRET` as Cloudflare Worker secrets; bind the Queue and D1 only in the production environment. Do not store private keys in GitHub Actions. Store only a minimal Cloudflare deployment token in the protected deployment environment.
- [ ] Document Queue/D1 provisioning, App permission and webhook setup, secret rotation, deployment, checking PR Checks and Cloudflare logs, quota behavior, and rollback/disable steps.
- [ ] Update the Wiki index date/log and relevant architecture/decision notes after the actual architecture change.
- [ ] Run the fixed verifier, Worker tests, typecheck, and Wrangler production dry run before deployment.

### Task 8: Deploy and run a human-observed Stage 0 pilot

**Explicit deployment gate:** This task provisions or changes production Cloudflare resources, secrets, bindings, and the GitHub webhook. It requires separate, explicit maintainer approval immediately before execution. Approval to implement or merge the code does not authorize production resource changes.

- [ ] Confirm the reviewed policy revision is active, Cloudflare Free quotas are still sufficient, the report context is not required, and the App is installed only on the configured repository.
- [ ] Add production Worker secrets and configure only the selected GitHub webhook events. Do not expose secrets to preview environments.
- [ ] Deploy the trusted `main` build; verify signature rejection and an allowed webhook using mocked/local fixtures before live observation.
- [ ] Use a non-production open PR whose owner authorizes observation. Recheck its current state at execution time; do not assume PR #264 is still a suitable pilot.
- [ ] Confirm the PR Checks tab shows a neutral, non-required Stage 0 report for the current head SHA, and compare its action/reason to the local read-only `inspect` output.
- [ ] Confirm no rerun, code change, push, merge, or production action occurred. Keep the system observe/report-only after the pilot.

## Acceptance criteria

- A supported GitHub webhook produces an idempotent hosted observation without a maintainer computer running the observer.
- A Check Run is visible under the observed PR's Checks tab and is attached to the exact current head SHA.
- The report is bounded, `neutral`, and excluded from required checks; it never grants merge readiness.
- Missing, stale, unsupported, incomplete, unattested, or over-budget evidence remains unavailable/waiting.
- No PR source code is checked out or executed, and no Actions rerun, repair, push, merge, or operation against Digital-E commerce production is possible through this host. Deploying the control-plane Worker itself is a separate, explicitly approved infrastructure operation.
- Tests and static API-path assertions prove the only GitHub write capability is report Check Run create/update.
- The local read-only CLI continues to work, and its tests remain in the fixed verifier.
- App secrets are only stored as production Cloudflare secrets; PR CI cannot read them.

## Rollback

Disable the Worker webhook route and scheduled trigger or remove the GitHub webhook delivery endpoint, pause the Queue consumer, and revoke `checks:write` from the App if report publication must stop. Existing report Check Runs remain visible but non-required. Preserve D1 only long enough to support incident review; purge it under the documented retention policy. No rollback step may change PR code or merge a branch.
