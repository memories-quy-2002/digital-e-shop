# PR babysitter contract — Phase 2

Phase 2A provides a deterministic, GitHub-agnostic decision core in
`scripts/loop/`. Phase 2B supplies the trusted GitHub host, authentication,
approval, read/write adapters, and CLI. The core does not authenticate its
caller or perform writes by itself.

## Decision actions

The decision engine returns exactly one action:

`wait | retry-check | request-repair | escalate | ready-for-human`

`neutral` and `skipped` count as green only when their check or workflow run is
completed. A confirmed empty required-policy snapshot may produce
`ready-for-human`; an unavailable or partial policy read must not be treated as empty.

## Revision and required evidence

- Bind each PR snapshot and state to `baseSha`, `headSha`, and the current
  `mergeSha` when GitHub provides one. Each check observation also records
  `testedSha`, which must equal the current head or merge SHA. State schema v3 scopes observations,
  flaky retries, and failure-fingerprint counters to that tuple.
- Every check observation includes the snapshot tuple and `testedSha`. A check
  may be used only when the tuple is still current and `testedSha` equals the
  current head SHA or current merge SHA. Stale or unrelated evidence waits for
  fresh collection; it never drives retry or repair.
- Reconcile PR state against a fresh snapshot for the same repository and PR
  before recording observations. An observation with a different tuple is
  rejected; it cannot roll state backward or reset retry/failure counters.
- A required-check identity includes its context and app ID when available. A
  required-workflow identity includes repository ID, workflow path, ref, and
  source SHA. Exactly one current evidence object must match each required
  identity; missing or multiple observations wait.
- The host adapter supplies a SHA-256 failure fingerprint computed from
  canonical, bounded, sanitized failure evidence. Phase 2A validates the digest
  and binds it to the observed attempt; it does not authenticate or recompute
  the adapter's source.
- Phase 2A uses PR-local same-failure, flaky-retry, and repair counters. The
  trusted host enforces `maxWallClockSeconds`, token, and CI-run budgets from
  validated `LoopState`, not `PrBabysitterState.startedAt`. If a configured
  token limit is enabled and token usage is unknown, the host fails closed.

## Failure classification

| Category | Required handling |
|---|---|
| `branch-caused` | Request a scoped repair only for relevant current evidence. A packet proposes the branch and path scope; it does not authorize a write. |
| `flaky` | Do not change product code. Retry the same check only within the retry budget and after the host approval gate. |
| `infrastructure` | Do not edit product code to compensate for GitHub, network, or third-party failures. Escalate with a stable reason code. |
| `protected` | Do not repair protected paths/actions without a separate exact-scope approval. Critical paths/actions remain blocked. |
| `ambiguous` | Do not guess or repair from arbitrary log text. Escalate for human diagnosis. |

## Packets and telemetry

- Escalation packets contain stable PR/check IDs, SHA tuple, reason codes,
  redacted/truncated output, bounded attempt counts, protected-path evidence,
  and human choices. Review comment bodies, prompts, credentials, raw
  logs, and signed URLs are excluded and never persisted.
- Repair packets identify the exact branch, proposed path scope, failed check
  IDs, remaining budgets, and a plan from the fixed verifier registry. They
  contain no arbitrary executable field and grant no
  worktree or GitHub capability.
- Telemetry accepts bounded stable identifiers and numeric summaries only.
  It does not accept prompts, review bodies, CI logs, credentials, or arbitrary
  command output.

## Capability boundary

- Phase 2A performs no GitHub API writes, check reruns, branch pushes, merges,
  model calls, or product-code edits. It must not merge or mutate production.
  Packet creation is a control-plane operation, not a write capability.
- Phase 2B must authenticate the human approver, derive current paths and PR
  SHA tuple from trusted sources, invoke the fixed verifier, observe completion
  independently, and constrain each write to a single-use exact-scope
  attestation. Without those checks, keep the runner observe-only.
- Phase 2B owns check reruns and branch pushes; it never owns merge authority.
- Never merge, bypass branch protection, alter production data, run production
  migrations/resets, or promote a production deployment. Human review remains
  required before merge.
