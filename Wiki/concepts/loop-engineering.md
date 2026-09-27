# Loop Engineering

Loop Engineering is a bounded, auditable control plane around coding work—not an autonomous production operator. The Phase 1 foundation supplies local policy loading, deterministic path/action risk classification, compact state, verification planning, failure classification, and a bounded state machine.

## Control-plane placement

- `scripts/loop/` owns the implementation: policy, risk classifier, state/budgets, verification runner, failure classifier, and controller.
- `.agent/policy/` owns versioned path, action, and stop-condition policy; an agent must not silently weaken it during an active run.
- `.agent/loops/` describes the feature inner loop and the future PR babysitter contract.
- `.loop/state/<task-id>.json` is local, gitignored metadata. It stores stable IDs, hashes, counters, statuses, and failure fingerprints—not prompts or customer data.
- `AGENTS.md` remains the repository operating contract; this Wiki page explains why these boundaries exist.

## Safety boundaries

- Risk is classified before writes; high/critical policy globs match case-insensitively to avoid filesystem casing aliases. Phase 1 has no trusted approval provider, so caller-supplied scope/timestamp metadata cannot authorize high-risk work; it always escalates. Critical paths and actions never enter implementation.
- The Phase 1 controller is state-only, not a write capability; its policy/path/verification context is caller input, not an authenticated attestation. A future host adapter must load canonical policy, derive changed paths, invoke the fixed verifier itself, independently observe completion evidence, authenticate approval, and constrain actual writes to that exact set.
- The runner reads Git HEAD and fingerprints the index plus changed tracked/untracked files before and after checks; the controller reaches `done` only if both snapshots and the host-observed completion fingerprint match, alongside matching verifier/host Git revisions and `LoopState.headSha`. The fingerprint excludes ignored dependencies/caches and cannot detect transient edits restored before the final sample, so local green results are provisional, not authenticated attestations. Clean-checkout hosted CI and required external checks remain mandatory before handoff. Retries are bounded, and only a relevant current-revision branch-caused failure may enter repair.
- A full result remains incomplete while required external checks have not run. Infrastructure, stale, protected, and ambiguous failures escalate instead of triggering product-code edits.
- The runner uses a fixed command registry and a sanitized child environment, refuses real dotenv files and project npm authentication settings, and is defense-in-depth rather than an OS sandbox.
- Phase 1 makes no GitHub writes: it does not dispatch issues, update/comment on PRs, push, or merge. Production database mutation, migration/reset, and deployment promotion are outside the loop; merge and production operations remain human-controlled.

## Rollout boundary

The PR babysitter is a Phase 2 design only. Issue-to-Draft-PR dispatch and post-merge observation are later phases and must not be inferred from the issue form or local controller. See [[architecture]] and [[index]].
