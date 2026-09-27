# Loop Engineering

Loop Engineering is a bounded, auditable control plane around coding work—not an autonomous production operator. The Phase 1 foundation supplies local policy loading, deterministic path/action risk classification, compact state, verification planning, failure classification, and a bounded state machine.

## Control-plane placement

- `scripts/loop/` owns the implementation: policy, risk classifier, state/budgets, verification runner, failure classifier, and controller.
- `.agent/policy/` owns versioned path, action, and stop-condition policy; an agent must not silently weaken it during an active run.
- `.agent/loops/` describes the feature inner loop and the future PR babysitter contract.
- `.loop/state/<task-id>.json` is local, gitignored metadata. It stores stable IDs, hashes, counters, statuses, and failure fingerprints—not prompts or customer data.
- `AGENTS.md` remains the repository operating contract; this Wiki page explains why these boundaries exist.

## Safety boundaries

- Risk is classified before writes. High/critical/protected work requires exact human approval; critical paths and actions never enter implementation.
- Deterministic verification is authoritative. Retries are bounded, failure classification uses structured metadata, and only a relevant current-revision branch-caused failure may enter repair.
- A full result remains incomplete while required external checks have not run. Infrastructure, stale, protected, and ambiguous failures escalate instead of triggering product-code edits.
- The runner uses a fixed command registry and a sanitized child environment, refuses real dotenv files and project npm authentication settings, and is defense-in-depth rather than an OS sandbox.
- Phase 1 makes no GitHub writes: it does not dispatch issues, update/comment on PRs, push, or merge. Production database mutation, migration/reset, and deployment promotion are outside the loop; merge and production operations remain human-controlled.

## Rollout boundary

The PR babysitter is a Phase 2 design only. Issue-to-Draft-PR dispatch and post-merge observation are later phases and must not be inferred from the issue form or local controller. See [[architecture]] and [[index]].
