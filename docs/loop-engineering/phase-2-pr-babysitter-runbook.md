# Phase 2 PR Babysitter rollout runbook

**Updated:** 2026-09-30

**Policy status:** proposed; independent review and merge are required before host implementation.

**Operational mode:** the observer is read-only. A separate report-only Check Run publisher is not implemented or enabled; existing write stages remain disabled.

## Current implementation and safe starting point

The PR Babysitter core, GitHub App authentication and approval provider, GitHub
observation client, guarded Actions rerun adapter, repair session, and orchestration
function are present in `scripts/loop/`. The entry point is the exported
`runPrBabysitterCli({ argv, trustedHost, io })` function in
`scripts/loop/pr-babysitter-cli.mjs`.

There is no standalone CLI entrypoint and no trusted-host factory in this
repository. A caller must supply a `trustedHost` assembled by a separately
reviewed host. The host must load canonical policy, derive changed paths from
the checkout, invoke the fixed verifier, independently observe completion
revision and workspace fingerprint, authenticate exact-scope approval, and
constrain writes. Without that bootstrap, a live observation cannot be run
through the trusted adapter. **A real Stage 0 run is pending host bootstrap and
an eligible open PR.** No PR has been used as a Stage 0 target. The policy for a
future hosted report publisher is separate from the observer and is inactive
until it has passed review and merge. Host implementation must begin in a fresh
run from that reviewed policy revision; this documentation change does not
enable an App permission, Worker, or deployment.

The following is the host-injected API shape, with placeholders only. It is an
embedding example, not a runnable shell command; replace the PR placeholder
with a decimal PR number and provide a trusted host created by the reviewed
bootstrap:

```js
import { runPrBabysitterCli } from './scripts/loop/pr-babysitter-cli.mjs';

const result = await runPrBabysitterCli({
  argv: ['inspect', '--repo', '<owner>/<repo>', '--pr', '<pr-number>'],
  trustedHost, // supplied by the reviewed host bootstrap
  io: { stdout: process.stdout, stderr: process.stderr },
});
```

`inspect` reads GitHub evidence and may update local `.loop/state/` metadata; it
does not write to GitHub, rerun jobs, repair code, push, or merge. A `decide`
call also emits bounded local telemetry. Required workflow evidence stays
unavailable until the host can attest the workflow source SHA for the exact
repository ID, path, ref, and SHA.

For an observer-only Stage 0 baseline, select one open, non-production,
same-repository PR. Compare the adapter's base/head/merge SHA tuple, required
check and workflow identities, tested SHAs, and decision with GitHub's PR and
checks views. Keep all write capabilities disabled during this observation.
A future report-publisher pilot is a separate operation and must follow the
constraints below after its own implementation and review. Do not treat
missing, partial, stale, ambiguous, or unattested evidence as an empty policy
or as green.

## Stage 0 — read-only observer and separately gated report publisher

**Observer allowed:** read PR, check, required-policy, workflow, review, and
bounded redacted job-log metadata; classify evidence; persist bounded local
state and telemetry; emit a decision or escalation packet. The observer has no
GitHub write capability.

**Publisher, only after a separate reviewed implementation:** one fixed
`Loop Engineering Stage 0` Check Run on the current PR head SHA, with a bounded
observation summary and `neutral` conclusion. Re-read the repository/PR
`{baseSha, headSha, mergeSha}` tuple immediately before publication and discard
stale decisions. Recollect required-check policy before each publish and refuse
if it is unavailable/incomplete or if the report context is required. The
report context must never be configured as a required check: GitHub lists
`neutral` among successful required-check conclusions, so a neutral report
could satisfy a merge gate if configured as required. Keep report output
informational; it never means merge-ready.

The dedicated App token needs `checks:write` for Check Run creation/update, but
GitHub also grants that permission for Check Run re-requests, Check Suite
creation, Check Suite preference changes, and Check Suite re-requests. Enforce
the publisher's method/path allowlist at the HTTP transport: permit only
`POST /repos/{owner}/{repo}/check-runs` and
`PATCH /repos/{owner}/{repo}/check-runs/{check_run_id}` for writes, with only
the fixed read-only lookup needed to find its own report. Reject all other
mutations, including check re-requests, suite endpoints, Actions reruns, issue
or comment writes, contents writes, and merges. Do not grant `actions:write` or
`contents:write` to this publisher.

**Always blocked:** Actions reruns, code repair, branch pushes, merges, issue
or comment writes, and operations against Digital-E commerce production
systems through the Loop host. Cloudflare provisioning/deployment is outside
the observer and publisher capabilities and needs separate explicit maintainer
approval. The read-only observer cannot publish. Missing, partial, stale, or
unattested evidence waits or escalates; a report publisher must refuse it.

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
| Stage 0 report publisher (future; disabled) | Separate capability using observation permissions plus `checks:write` | Only fixed Check Run create/update routes; current head SHA, `neutral`, bounded report, non-required context, fresh tuple/policy checks; reject all other writes including re-requests and suite writes |
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
