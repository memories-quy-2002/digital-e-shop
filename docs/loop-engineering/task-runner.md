# Autonomous task runner boundary

**Updated:** 2026-10-13
**Status:** Local implementation is present on `feature/autonomous-task-lifecycle`; autonomy and auto-merge remain disabled. This is not a live Issue-to-merge pilot.

## Current flow

The Cloudflare Worker verifies signed Issue events, checks the sender and opt-in label against policy loaded from an immutable default-branch revision, persists digest-only TaskRecord metadata in D1, and publishes a bounded Queue envelope. A Queue handler claims a versioned D1 lease, checks canonical policy, and dispatches to an authenticated host runtime. The Worker has a Queue handler and Queue producer, but the production Queue consumer and runner service binding are not provisioned: the coding runtime uses Docker and cannot run inside a Cloudflare Worker.

The trusted host runtime re-fetches the Issue before acknowledging dispatch and checks its digest, actor, and opt-in label again before model use and delivery writes. It validates the current TaskRecord and lease, runs the real task pipeline for queued work, runs the delivery host for a verified worktree, and exposes only authenticated task dispatch/status endpoints. A supervisor must report the exact task, lease owner, and TaskRecord version before an expired process can be treated as stopped.

The pipeline creates a detached task worktree and runs a digest-pinned Docker image as a non-root user with no network, no Linux capabilities, bounded resources, and an ephemeral writable work area. The host owns the model broker, policy, budget reservation, fixed verifier, exact-path patch authorization, Git operations, and GitHub credentials. The container sees no API key or GitHub write token. Model calls use the injected host broker; no reusable key was found in the current environment, and no live or billable OpenAI request has been made.

Delivery uses the existing TaskRecord reducer and lease-bound compare-and-save store. It checks trusted policy files are clean at the pinned revision, verifies changed paths and risk, requires a single-use exact-scope `issue:delivery` approval before GitHub writes, pushes without force, and reconciles ambiguous branch/PR outcomes. A draft PR targets `main`, links the Issue, and reports actual local verification plus pending hosted checks. No real GitHub write has been performed in this work.

CI reconciliation and merge eligibility are implemented as evidence-driven gates. Required check/workflow identity and current SHA tuples are validated; retry and repair recommendations require an opaque budget reservation. No live rerun or repair executor is wired. Merge evaluation requires the current policy, full verification, repository rules, checks, and an independent human review. There is no native auto-merge writer, and the canonical policy does not grant that capability.

Completion reports require fresh merge, verifier, required-check, and workflow-source evidence. The reporting-to-completed reducer edge now consumes a one-use proof issued by a host completion gate and bound to the TaskRecord version and current lease. The runtime does not yet publish this report as a GitHub Issue comment.

## Recovery and rollout limits

- A task whose Docker process termination is uncertain keeps its lease and repository concurrency slot. The runtime releases a lease only after the executor has yielded to a durable state or the trusted supervisor confirms it stopped.
- Task status after a host restart is unknown unless the configured trusted supervisor can prove the exact owner/version is stopped or running. Process-registry absence is not evidence.
- Automatic reuse of an existing task worktree is not implemented; recovery fails closed rather than resetting counters or task state.
- The production Queue consumer and private runner-gateway binding require an operator-owned deployment path for the Node/Docker host. They are not configured in Wrangler yet.
- `.agent/policy/autonomy.yml` remains `enabled: false` and `autoMergeEnabled: false`. Do not enable it during this implementation run. Review and merge policy separately, then begin a fresh run from that revision.
- A live pilot requires a host-managed OpenAI API key, the private runner gateway and supervisor, production Queue/D1 bindings, exact approvals, required hosted CI evidence, a human review, and a controlled non-production Issue. ChatGPT/Codex subscription access is separate from API billing.

See the [implementation plan](../superpowers/plans/2026-10-13-autonomous-issue-to-merge.md), [Hosted Stage 0 runbook](hosted-stage0-runbook.md), and [[loop-engineering]].
