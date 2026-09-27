# Feature loop contract

This document describes the bounded inner loop for low- and medium-risk repository work. It is an operating contract, not an autonomous issue dispatcher.

## Input

- A concise goal, acceptance criteria, non-goals, constraints, and verification expectations.
- A task ID and stable acceptance-criterion IDs; do not persist the raw request or issue body in loop state.
- The current branch/base/head revisions, changed paths, validated policy, and a deterministic risk result.
- Human approval with an exact affected-path scope and timestamp before any high-risk write. Critical paths and actions cannot be approved for execution.

## Inspect

- Read the relevant source, tests, repository instructions, and Wiki context before changing files.
- Normalize changed paths and classify risk before entering a write phase. Treat unrecognized or inconsistent evidence as medium/high risk or escalation, never as permission to write.
- Keep state under `.loop/state/<task-id>.json`; persist only IDs, revisions, counters, statuses, fingerprints, and bounded summaries.

## Implement

- Make the smallest change that satisfies the goal and acceptance criteria.
- Keep writes on the authorized feature branch and within the approved path scope.
- Do not modify the policy and then continue the same run under the newly weakened policy.

## Verify

- Use fast verification for repair iterations and full verification before handoff. Deterministic verification is authoritative; `passed: true` is not enough when `complete` is false or required external checks remain.
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

- Escalate infrastructure/network failures, protected-path work without exact approval, stale or mismatched evidence, ambiguous failures, malformed state, and exhausted budgets.
- Include stable reason codes, revision/check IDs, and redacted bounded evidence; omit raw prompts, secrets, customer data, and unbounded logs.

## Never

- Never bypass authentication, CSRF, ownership checks, branch protection, or required CI/security gates.
- Never disable tests or weaken checks to manufacture a pass.
- Never push directly to `main`, merge a PR, run production migrations/resets, or promote a production deployment.
- Never interpolate untrusted task text or filenames into a shell command, and never treat this runner as a security sandbox.
