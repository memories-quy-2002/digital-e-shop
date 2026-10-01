# Phase 2 PR Babysitter rollout runbook

**Updated:** 2026-10-01

**Policy status:** the hosted Stage 0 observer and report-only Check Run publisher are implemented and locally verified. Production resources, secrets, webhook, deployment, and pilot remain behind the separate Task 8 approval gate.

**Operational mode:** the observer has no PR mutation capability. The separate report publisher can only create/update its bounded neutral Check Run and is not deployed. All other write stages remain disabled.

See the [Hosted Stage 0 runbook](hosted-stage0-runbook.md) for Cloudflare setup, checks/logs, free-plan bounds, and rollback.

## Current implementation and safe starting point

The PR Babysitter core, GitHub App authentication and approval provider, GitHub
observation client, guarded Actions rerun adapter, repair session, and
host-injected orchestration function are present in `scripts/loop/`. The
reviewable Stage 0 host bootstrap and standalone read-only entrypoint are
`scripts/loop/pr-babysitter-host.mjs`, exported as
`runPrBabysitterStage0`; it calls the host-injected
`runPrBabysitterCli({ argv, trustedHost, io })` in
`scripts/loop/pr-babysitter-cli.mjs`. It assembles only the `inspect` command
for the fixed repository `memories-quy-2002/digital-e-shop` (repository ID
`743050379`). It rejects rerun, repair, and other commands before loading App
credentials or contacting GitHub.

The host checks that the origin identifies the fixed GitHub repository, the
checkout is clean and on the open PR's same-repository feature head, and the
PR targets `main`. It loads the canonical Loop policy from the exact PR base
commit. Its installation token is restricted to this repository and the
`metadata:read`, `pull_requests:read`, `checks:read`, `actions:read`, and
`administration:read` permissions. The App private key must be a regular file
outside the checkout. The bootstrap does not use maintainer device flow or
provide GitHub write adapters.

The hosted Cloudflare implementation separates the observer's read-only GitHub client from a report-only capability. The report client permits only the fixed Check Run lookup, create, and update routes; it rechecks the PR SHA tuple and complete required-check policy before writing. It always publishes `neutral` against the current head SHA, refuses if its name is required, and cannot rerun Actions, push, comment, or merge. It has not been deployed.

Set the dedicated App settings in the current PowerShell session, then run the
read-only observation from the matching clean PR checkout. Keep the private
key at an absolute path outside the checkout and restrict its Windows file
permissions to the local host user:

```powershell
$env:LOOP_GITHUB_APP_ID = '<app-id>'
$env:LOOP_GITHUB_APP_CLIENT_ID = '<client-id>'
$env:LOOP_GITHUB_APP_INSTALLATION_ID = '<installation-id>'
$env:LOOP_GITHUB_APP_PRIVATE_KEY_FILE = '<absolute-path-outside-checkout>'
node scripts/loop/pr-babysitter-host.mjs inspect --repo memories-quy-2002/digital-e-shop --pr <pr-number>
```

`inspect` reads GitHub evidence and may update local `.loop/pr/` metadata. It
does not write to GitHub, rerun jobs, repair code, push, or merge. The JSON
output includes the PR SHA tuple, effective required identities, tested SHA,
bounded check observations, workflow evidence status, and review counts; it
omits review bodies, credentials, and raw check logs. Required workflow
evidence remains unavailable until a trusted source attestation matches the
exact repository ID, path, ref, and source SHA. Missing, partial, stale,
ambiguous, or unattested evidence waits or escalates.

`checkCollectionsBySha` reports each current head and merge SHA separately,
including collection status, check collection completeness, matched and
unmatched required identities, and bounded observations. A `null` unmatched
list means that SHA's PR snapshot is stale or unavailable. The top-level
`testedSha` and observations remain the collection passed to the decision
engine; per-SHA diagnostics do not turn missing evidence green.

An initial live Stage 0 observation was run against PR #264 on 2026-09-30. It
returned `wait` with `required_check_evidence_missing`; the effective policy
snapshot was complete with 10 required check identities and no required
workflows, while the selected merge SHA had zero observations. That output did
not show head-SHA coverage separately. After this per-SHA summary change is
available in a clean checkout at the PR head, repeat the read-only observation
to compare both SHA collections with GitHub's PR checks view. Keep all write
capabilities disabled during this observation.

## Stage 0 — read-only observer with a local report-only publisher implementation

**Observer allowed:** read PR, check, required-policy, workflow, review, and
bounded redacted job-log metadata; classify evidence; persist bounded local
state and telemetry; emit a decision or escalation packet. The observer is read-only; the observer has no GitHub write capability.

**Report publisher implementation:** one fixed `Loop Engineering Stage 0`
Check Run on the current PR head SHA, with a bounded observation summary and
`neutral` conclusion. It re-reads the repository/PR `{baseSha, headSha,
mergeSha}` tuple before lookup and immediately before publication, and
recollects required-check policy. It refuses if that policy is unavailable,
incomplete, changed, or includes the report context. The report context must
never be configured as a required check. Production deployment remains gated
by Task 8.

The dedicated publisher token may need `checks:write`, but the transport must
allow only `POST /repos/{owner}/{repo}/check-runs` and
`PATCH /repos/{owner}/{repo}/check-runs/{check_run_id}` for writes. Reject all
other mutations, including check re-requests, Check Suite writes, Actions reruns,
issue/comment writes, contents writes, and merges. Do not grant the publisher
`actions:write` or `contents:write`.

**Always blocked for the observer:** no GitHub writes, no Actions reruns, no
code repair, no branch pushes, no merge, and no production operations.
Unavailable, stale, partial, ambiguous, or unattested evidence waits or
escalates. Cloudflare provisioning/deployment is outside both capabilities and
requires separate explicit maintainer approval.

**Promotion to Stage 1 requires all of these:**

- At least 10 representative failed/pending PR observations.
- Trusted approval verification and the workflow/job allowlist are implemented
  and reviewed.
- Eligible PR jobs use no secrets, protected environments, or write-capable
  token.
- 0 stale-SHA actionable decisions.
- 0 protected/infrastructure cases misclassified as branch-caused.
- Telemetry contains no secrets or raw review bodies.

## Stage 1 — flaky rerun

Unlock only the `actions:write` installation-token capability. Rerun only a
confirmed flaky failure, and only the allowlisted workflow ID, run ID, attempt,
and job IDs bound to the current PR SHA tuple and tested SHA. Require the trusted
maintainer's fresh TTY approval and a fresh PR tuple check immediately before
the request. Reserve the CI-run budget and idempotency key before the GitHub
POST.

Refuse a rerun if the workflow or reusable-workflow definition changed in the
PR, the workflow/job is outside the reviewed allowlist, its privilege or secret
use is unknown, evidence is stale or incomplete, the approval is forged,
expired, replayed, or out of scope, or any retry/rate limit is exhausted. Stage
1 does not repair code or push branches.

**Promotion to Stage 2 requires all of these:**

- At least 10 bounded rerun decisions, or sufficient representative fixtures
  when real flaky failures are rare.
- No retry-budget overruns.
- No duplicate reruns.
- Operators understand that an installation token is repository-scoped and
  permission-scoped but not branch-scoped; GitHub branch protection guards
  protected refs.

## Stage 2 — repair handshake

Enable repair packets and sessions only for approved same-repository,
non-`main` branches. The coding agent returns a bounded patch proposal. The
trusted host validates the proposed paths against canonical policy, obtains
fresh path-scoped approval in a TTY, applies only validated, path-approved
changes, and runs the fixed full verifier. The host independently checks the final diff,
revision, workspace fingerprint, PR tuple, branch ref, and budgets before a
push.

After approval, the host re-reads the PR tuple, commit, workspace fingerprint,
and final diff. It checks the contents:write budget before minting the token.
After minting, it repeats those reads and checks the budget again immediately
before the push.

The host mints a repository-scoped `contents:write` token only after final path
validation and approval, then uses it outside the coding-agent process. A new
`validate-repair` invocation reauthenticates the approver and gets a fresh TTY
approval; approval from an earlier command is not reused. Verify the expected
non-`main` ref and head SHA before push. GitHub branch protection remains the
server-side guard. Stage 2 remains human-reviewed before merge indefinitely in
Phase 2. It does not merge.

## Credential and permission review

| Purpose | Credential and effective repository permission | Guard |
| --- | --- | --- |
| Maintainer identity and approval | GitHub App device-flow user token; used to verify `/user` and repository write eligibility | Trusted user ID allowlist, interactive TTY, short-lived single-use approval bound to PR tuple, capability, and paths |
| PR and policy observation | App installation token with `metadata:read`, `pull_requests:read`, `checks:read`, `actions:read`, `administration:read`, and `contents:read` for canonical policy at the exact base SHA | Restricted to the configured repository; never persisted in loop state or telemetry |
| Stage 0 report publisher (implemented; not deployed) | Separate token capability with `checks:write` | Only fixed Check Run lookup/create/update routes; current head SHA, `neutral`, bounded report, non-required context, fresh tuple/policy checks; reject all other writes including re-requests and suite writes |
| Actions rerun | Observation permissions plus `actions:write` | Restricted to the configured repository; exact allowlisted workflow/run/attempt/job IDs, current SHA tuple, fresh approval, and finite CI budget; no contents-write permission |
| Branch push | Observation permissions plus `contents:write` | Restricted to the configured repository; exact approved paths, verified commit, fresh approval, independent final checks, expected non-`main` ref, and branch protection |
| App signing key | GitHub App private key held by the trusted host | Never placed in the repository, coding-agent context, logs, or telemetry |

GitHub App installation tokens expire and can be limited to repositories and
permissions. Their permission scope is not a branch restriction, so protected
branches still require server-side branch protection. The runner cannot merge,
administer secrets or repository settings, and has no
production database, migration, reset, or deployment-promotion capability. See the [GitHub
installation access token documentation](https://docs.github.com/en/rest/apps/apps#create-an-installation-access-token-for-an-app).

## Phase 2B mocked verification matrix

The fixed harness runs these local fixtures without GitHub credentials or live
PR writes:

| Area | Evidence in the harness |
| --- | --- |
| PR tuple, required identities, check status, green same-repository draft observation, stale and duplicate evidence | `pr-evidence.test.mjs`, `pr-babysitter.test.mjs`, `pr-state.test.mjs` |
| Pagination drift, head/merge tested SHA, policy completeness, workflow source SHA, redirects and bounded redacted logs | `github-pr-client.test.mjs` |
| Trusted maintainer, exact token permissions, approval scope, expiry, replay, and forged approval | `github-auth-provider.test.mjs` |
| Rerun allowlist, rejection of secret/protected-environment/write-capable job contracts, stale tuple, source attestation, rate/budget gates, idempotent reservation, and duplicate POST refusal | `github-actions-write.test.mjs` |
| Repair path approval, protected-path refusal, stable fixed-verifier result, token usage, and local commit | `repair-session.test.mjs` |
| Host injection boundary, dry-run behavior, orchestration, local budgets, and pre-push freshness | `pr-babysitter-cli.test.mjs` |
| Bounded metadata only and aggregation input validation | `telemetry.test.mjs` |

Required workflow identity is `{ repositoryId, path, ref, sha }`. Missing source
SHA attestation, inaccessible source, duplicate matching runs, partial
collection, or stale evidence stays unavailable or waits. A workflow display
name, path, ref, or PR commit SHA alone cannot make it green.

## Non-goals and Phase 3 telemetry

Phase 2 has no auto-merge, no `pull_request_target`, no autonomous
review-comment execution, no production mutation, no persistent Playwright E2E
project, and no vendor-specific model runner. Human review remains required
before merge.

For a later Phase 3 decision, aggregate these bounded metrics after host
bootstrap: classification accuracy after human review; stale-evidence refusals;
flaky rerun success rate; repair-request success rate; median repair
iterations; CI runs per successful PR; token usage per repair when the host
exposes it; and human intervention reasons recorded as stable reason codes.
There is no live telemetry baseline before the trusted host bootstrap and Stage
0 observation.
Current local telemetry stores
bounded action/reason/category, retry and repair counts, elapsed time,
human-intervention status, and optional token input/output counts. It does not collect raw
prompts, review bodies, credentials, signed URLs, or unbounded CI logs. Keep any
future aggregate sourced from validated host state and stable reason codes.
