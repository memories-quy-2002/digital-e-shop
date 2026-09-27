# Feature loop contract

This document describes the bounded inner loop for low- and medium-risk repository work. It is an operating contract, not an autonomous issue dispatcher.

## Input

- A concise goal, acceptance criteria, non-goals, constraints, and verification expectations.
- A task ID and stable acceptance-criterion IDs; do not persist the raw request or issue body in loop state.
- The current branch/base/head revisions, changed paths, validated policy, and a deterministic risk result.
- Phase 1 has no trusted human-approval provider. Caller-supplied path/timestamp metadata is untrusted, so high-risk work always escalates; critical paths and actions cannot be approved for execution. A future trusted host adapter must authenticate the decision and bind it to the task, revision, and exact normalized path set before granting write capability.

## Inspect

- Read the relevant source, tests, repository instructions, and Wiki context before changing files.
- Normalize changed paths and classify risk before entering a write phase. High/critical policy globs are case-insensitive, preventing filesystem casing aliases from downgrading protected paths. Treat unrecognized or inconsistent evidence as medium/high risk or escalation, never as permission to write.
- The Phase 1 controller is a state-only reducer, not a write capability; its policy, paths, and verification fields are caller inputs, not authenticated attestations. A future host adapter must load canonical repository policy, derive affected paths from the checkout, invoke the fixed verifier itself, independently observe completion evidence, and constrain actual writes to that verified set.
- Keep state under `.loop/state/<task-id>.json`; persist only IDs, revisions, counters, statuses, fingerprints, and bounded summaries.

## Implement

- Make the smallest change that satisfies the goal and acceptance criteria.
- Keep changes on the authorized feature branch and within the task's declared scope; the Phase 1 reducer does not enforce an actual write set.
- Do not modify the policy and then continue the same run under the newly weakened policy.

## Verify

- Use fast verification for repair iterations and full verification before handoff. The runner records `verifiedRevision`/`currentRevision` and `verifiedWorkspaceFingerprint`/`currentWorkspaceFingerprint`; `revisionStable`/`workspaceStable` and `complete` are false if HEAD or the sampled index-plus-tracked/untracked-working-tree snapshot changes. Ignored dependencies/caches are not fingerprinted, and transient edits restored before the final sample are not detectable, so local green results are provisional rather than authenticated attestations. Hosted CI must run from a clean checkout, and required external checks must pass before handoff.
- The controller reaches `done` only when the runner's start/end workspace fingerprints match the host-observed completion fingerprint, and its start/end Git revisions match the host-observed completion revision and `LoopState.headSha`.
- Use the fixed command registry in `scripts/loop/verify.mjs`; changed paths and issue text are never command fragments.
- The runner isolates its child environment and refuses real dotenv files or project npm authentication settings, but it is defense-in-depth—not an operating-system sandbox. Untrusted code requires a credential-free isolated worktree.

## Repair

- Repair only when structured evidence identifies a relevant, deterministic failure at the current revision as branch-caused.
- Retry a same-check pass/fail at the same revision only within the flaky retry budget and without changing product code.
- Re-run the relevant fast checks after a repair, then complete full verification before handoff.

## Stop

- Stop when any configured iteration, same-failure, flaky-retry, wall-clock, diff, token, or CI-run budget is exhausted.
- Do not report completion while required checks are missing, a criterion is failed/blocked/pending, or the final revision differs from the revision verified.

## Escalate

- Escalate infrastructure/network failures, all high/protected work while the trusted approval provider is absent, stale or mismatched evidence, ambiguous failures, malformed state, and exhausted budgets.
- Include stable reason codes, revision/check IDs, and redacted bounded evidence; omit raw prompts, secrets, customer data, and unbounded logs.

## Never

- Never bypass authentication, CSRF, ownership checks, branch protection, or required CI/security gates.
- Never disable tests or weaken checks to manufacture a pass.
- Never push directly to `main`, merge a PR, run production migrations/resets, or promote a production deployment.
- Never interpolate untrusted task text or filenames into a shell command, and never treat this runner as a security sandbox.
