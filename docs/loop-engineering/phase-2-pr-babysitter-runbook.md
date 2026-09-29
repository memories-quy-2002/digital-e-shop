# Phase 2 PR Babysitter rollout runbook

**Reviewed:** 2026-09-29

**Operational mode:** observe-only; write stages are not enabled.

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
an eligible open PR.** No PR has been used as a Stage 0 target.

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

To schedule Stage 0 after bootstrap review, select one open, non-production,
same-repository PR. Compare the adapter's base/head/merge SHA tuple, required
check and workflow identities, tested SHAs, and decision with GitHub's PR and
checks views. Keep all write capabilities disabled during this observation.
Do not treat missing, partial, stale, ambiguous, or unattested evidence as an
empty policy or as green.

## Stage 0 — observe-only

**Allowed:** read PR, check, required-policy, workflow, review, and bounded
redacted job-log metadata; classify evidence; persist bounded local state and
telemetry; emit a decision or escalation packet.

**Blocked:** No GitHub writes, no Actions reruns, no code repair, no branch
pushes, no merge, and no production operations. Unavailable or stale evidence
waits or escalates.

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
| PR and policy observation | App installation token with `metadata:read`, `pull_requests:read`, `checks:read`, `actions:read`, and `administration:read` | Restricted to the configured repository; never persisted in loop state or telemetry |
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
