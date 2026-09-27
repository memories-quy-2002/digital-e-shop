# PR babysitter contract — Phase 2 design only

This file records a future operating contract. The Phase 1 foundation does not ingest GitHub events, comment on or update a PR, push a repair commit, or merge anything.

## Failure classification

| Category | Required handling |
|---|---|
| `branch-caused` | Repair only when the verifier confirms relevant changed scope and the evidence belongs to the current revision. Stay on the PR branch, respect risk approval, and stop at the configured iteration/same-failure budget. |
| `flaky` | Do not change product code. Retry the same check only within the flaky retry budget and preserve revision/check evidence. |
| `infrastructure` | Do not edit product code to compensate for GitHub, Vercel, network, or third-party failures. Escalate with a stable reason code. |
| `protected` | Do not repair protected paths/actions in the babysitter loop. Require a separately approved high-risk execution session; critical paths/actions remain blocked. |
| `ambiguous` | Do not guess or repair from arbitrary log text. Escalate for human diagnosis. |

## Phase 2 boundaries

- Consume structured CI/review events and bind every result to the PR head SHA and stable check ID.
- Keep retries bounded, preserve redacted evidence, and modify only the authorized PR branch for a branch-caused defect.
- The babysitter must not merge, bypass branch protection, change policy and execute under that change in one run, alter production data, run a production migration/reset, or promote a production deployment.
- Human review remains required before merge and for high/critical/protected work.
