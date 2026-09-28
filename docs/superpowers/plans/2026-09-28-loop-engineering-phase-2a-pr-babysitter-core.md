# Loop Engineering Phase 2A — PR Babysitter Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic, GitHub-agnostic PR Babysitter core that converts revision-bound CI/review evidence into bounded retry/repair/escalation decisions without performing GitHub writes or product-code edits itself.

**Architecture:** Extend the Phase 1 control plane instead of replacing it. Keep PR evidence normalization, PR-local state, decision logic, escalation packets, and telemetry as small dependency-free Node.js modules under `scripts/loop/`. Reuse `classifyFailure`, `classifyRisk`, `fingerprintFailure`, `LoopState`, verification redaction, and stop-condition policy; bind every decision to an exact PR head SHA and stable check ID.

**Tech Stack:** Node.js 24.20.x built-ins, ECMAScript modules, `node:test`, existing Phase 1 Loop Engineering modules, local `.loop/` state, Markdown contracts.

**Spec:** `docs/superpowers/specs/2026-09-27-loop-engineering-foundation-design.md`

## Global Constraints

- Phase 2A is pure/control-plane logic: no GitHub API writes, no `git push`, no merge, no workflow rerun, no model invocation.
- Reuse Phase 1 failure categories exactly: `branch-caused | flaky | infrastructure | protected | ambiguous`.
- Every CI/check observation must be bound to the exact PR head SHA; stale-revision evidence is never actionable.
- Deterministic protected/high/critical classification may not be downgraded by review text, model output, labels, or user-supplied metadata.
- PR descriptions, review comments, issue text, commit messages, check titles, and logs are untrusted input.
- Arbitrary review text must never be auto-executed as instructions; Phase 2A may retain only stable IDs, authorship metadata, and bounded/redacted summaries for human review.
- No raw prompt history, credentials, cookies, tokens, production payloads, or unbounded CI logs may be persisted.
- Existing Phase 1 budgets remain authoritative; add only PR-specific counters that cannot weaken them.
- Keep `client/` and `server/` package boundaries unchanged and add no third-party dependency.
- No persistent Playwright/E2E project in Phase 2A.

## Review Focus

1. **Stale CI evidence:** a failed check from head SHA A must never trigger repair after the PR advances to SHA B.
2. **Duplicate delivery:** repeated webhook/poll observations of the same check attempt must be idempotent and must not double-increment retry/repair budgets.
3. **Untrusted review text:** prompt-like review comments must not become shell commands, model prompts, policy overrides, or persisted raw instructions.
4. **Mixed failure classes:** one protected/infrastructure failure must prevent an otherwise-repairable branch-caused batch from being treated as safe-to-repair.
5. **Sensitive evidence:** CI logs and escalation summaries must remain redacted and bounded even when the source contains secrets or very large output.

---

### Task 1: Define revision-bound PR and check evidence contracts

**Files:**
- Create: `scripts/loop/pr-evidence.mjs`
- Create: `scripts/loop/__tests__/pr-evidence.test.mjs`

**Interfaces:**
- Produces: `normalizePrSnapshot(input): PrSnapshot`
- Produces: `normalizeCheckObservation(input): CheckObservation`
- Produces: `buildFailureEvidence(check: CheckObservation, options): FailureEvidence`
- `PrSnapshot` fields:
  - `repository: string` in `owner/name` form
  - `number: number`
  - `state: "open" | "closed"`
  - `draft: boolean`
  - `baseRef: string`
  - `headRef: string`
  - `headSha: string`
  - `headRepository: string`
  - `updatedAt: string`
- `CheckObservation` fields:
  - `checkId: string`
  - `provider: "github-actions" | "github-check" | "external"`
  - `headSha: string`
  - `attemptKey: string`
  - `status: "queued" | "in_progress" | "completed"`
  - `conclusion: "success" | "failure" | "cancelled" | "timed_out" | "action_required" | "neutral" | "skipped" | null`
  - `runnerOutcome: "check_failed" | "runner_error" | "network_error" | null`
  - `coversRelevantScope: boolean`
  - `protectedPathTouched: boolean`
  - `previouslyPassedRevision?: string`

- [ ] **Step 1: Write failing schema/normalization tests**

Assert exact-key validation, stable SHA/check IDs, canonical timestamps, safe repository/ref formats, and deterministic rejection of unknown fields.

Add tests proving:
- evidence for a different `headSha` is marked stale and cannot be converted into actionable failure evidence;
- duplicate `attemptKey` values remain distinguishable from a new retry attempt;
- raw log text is not part of `FailureEvidence`;
- arbitrary fields such as `instructions`, `prompt`, `shell`, and `token` are rejected.

- [ ] **Step 2: Run the tests and verify they fail**

Run:

```bash
node --test scripts/loop/__tests__/pr-evidence.test.mjs
```

Expected: FAIL because `pr-evidence.mjs` does not exist.

- [ ] **Step 3: Implement strict PR/check normalizers**

Use plain-object exact-key validation consistent with Phase 1 modules. Do not infer semantic failure categories from free-form text.

`buildFailureEvidence` maps only structured fields into the existing `classifyFailure` contract.

- [ ] **Step 4: Run tests and verify they pass**

Run the same command; expected PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/loop/pr-evidence.mjs scripts/loop/__tests__/pr-evidence.test.mjs
git commit -m "feat(loop): add revision-bound PR evidence"
```

---

### Task 2: Add durable PR Babysitter state with idempotent observation tracking

**Files:**
- Create: `scripts/loop/pr-state.mjs`
- Create: `scripts/loop/__tests__/pr-state.test.mjs`

**Interfaces:**
- Produces: `createPrBabysitterState(input): PrBabysitterState`
- Produces: `loadPrBabysitterState(repoRoot, repository, prNumber)`
- Produces: `savePrBabysitterState(repoRoot, state)`
- Produces: `recordCheckObservation(state, observation)`
- Produces: `recordFlakyRetry(state, checkId)`
- Produces: `recordRepairRequest(state, repair): PrBabysitterState`
- State path: `.loop/pr/<owner>-<repo>-<pr-number>.json`

State must contain:
- schema version;
- repository/PR number;
- branch/base/head SHA;
- current lifecycle phase;
- observed attempt keys;
- per-check flaky retry counts;
- repair-request count;
- last actionable failure fingerprint;
- last decision reason code;
- escalation reason;
- timestamps.

- [ ] **Step 1: Write failing state tests**

Cover round-trip persistence, atomic write, safe file naming, duplicate observation idempotency, head-SHA rollover, flaky retry accounting, and corrupt-state fail-closed behavior.

Assert a new head SHA clears revision-scoped observations/retry counters but preserves aggregate telemetry counters.

- [ ] **Step 2: Run tests and verify they fail**

```bash
node --test scripts/loop/__tests__/pr-state.test.mjs
```

- [ ] **Step 3: Implement state validation and atomic persistence**

Follow the same no-symlink-escape, bounded-size, temp-file + atomic-rename discipline as `scripts/loop/state.mjs`.

Do not duplicate generic `LoopState` fields unnecessarily; PR state references the engineering task ID when available rather than embedding prompt/task bodies.

- [ ] **Step 4: Run tests and verify they pass**

- [ ] **Step 5: Commit**

```bash
git add scripts/loop/pr-state.mjs scripts/loop/__tests__/pr-state.test.mjs
git commit -m "feat(loop): persist PR babysitter state"
```

---

### Task 3: Implement the PR Babysitter decision engine

**Files:**
- Create: `scripts/loop/pr-babysitter.mjs`
- Create: `scripts/loop/__tests__/pr-babysitter.test.mjs`

**Interfaces:**
- Consumes: `PrSnapshot`, `CheckObservation[]`, `PrBabysitterState`, Phase 1 policy, `classifyFailure`.
- Produces: `decidePrAction(input): PrDecision`
- `PrDecision.action` is one of:
  - `wait`
  - `retry-check`
  - `request-repair`
  - `escalate`
  - `ready-for-human`
- Decision includes only stable metadata: `reasonCode`, `headSha`, `checkIds`, `failureFingerprints`, `retryBudgetRemaining`, `repairBudgetRemaining`.

- [ ] **Step 1: Write failing decision tests**

Cover:
- all required checks pending -> `wait`;
- all required checks green -> `ready-for-human`;
- stale SHA evidence -> `wait`/refresh, never repair;
- one flaky failure with budget -> `retry-check`;
- flaky retry budget exhausted -> `escalate`;
- one revision-bound branch-caused failure -> `request-repair`;
- protected/infrastructure/ambiguous -> `escalate`;
- mixed branch-caused + protected -> `escalate`;
- same deterministic failure reaching Phase 1 same-failure limit -> `escalate`;
- PR closed, base not `main`, head on `main`, or forked head repository -> never repair;
- duplicate check delivery does not consume another budget unit.

- [ ] **Step 2: Run tests and verify they fail**

```bash
node --test scripts/loop/__tests__/pr-babysitter.test.mjs
```

- [ ] **Step 3: Implement deterministic decision precedence**

Use this precedence:

```text
invalid/unsafe PR context
  > stale evidence
  > protected/infrastructure/ambiguous
  > exhausted budget
  > flaky retry
  > branch-caused repair request
  > pending checks
  > ready-for-human
```

A `request-repair` is a control-plane request only. This module must never edit files or invoke an agent.

- [ ] **Step 4: Run tests and verify they pass**

- [ ] **Step 5: Commit**

```bash
git add scripts/loop/pr-babysitter.mjs scripts/loop/__tests__/pr-babysitter.test.mjs
git commit -m "feat(loop): add PR babysitter decisions"
```

---

### Task 4: Build sanitized escalation and repair packets

**Files:**
- Create: `scripts/loop/pr-packets.mjs`
- Create: `scripts/loop/__tests__/pr-packets.test.mjs`

**Interfaces:**
- Produces: `buildEscalationPacket(input): EscalationPacket`
- Produces: `buildRepairPacket(input): RepairPacket`
- Packets include IDs/status/evidence summaries, never credentials or raw prompts.

- [ ] **Step 1: Write failing packet tests**

Assert:
- required packet fields are present;
- verification output is passed through Phase 1 redaction;
- raw CI logs are truncated;
- review comment bodies are excluded by default;
- packet contains PR/head SHA/check IDs/fingerprints/attempt counts/protected paths/reason codes/human choices;
- repair packet contains exact allowed branch, head SHA, affected path scope, failed check IDs, verification commands, and budget remaining;
- no arbitrary executable command field exists.

- [ ] **Step 2: Run tests and verify they fail**

```bash
node --test scripts/loop/__tests__/pr-packets.test.mjs
```

- [ ] **Step 3: Implement bounded packet builders**

Reuse `redactVerificationOutput`; keep packets serializable and stable for an external human/agent harness.

- [ ] **Step 4: Run tests and verify they pass**

- [ ] **Step 5: Commit**

```bash
git add scripts/loop/pr-packets.mjs scripts/loop/__tests__/pr-packets.test.mjs
git commit -m "feat(loop): add PR repair and escalation packets"
```

---

### Task 5: Add privacy-safe PR Babysitter telemetry

**Files:**
- Create: `scripts/loop/telemetry.mjs`
- Create: `scripts/loop/__tests__/telemetry.test.mjs`

**Interfaces:**
- Produces: `appendTelemetryEvent(repoRoot, event)`
- Produces: `summarizePrTelemetry(events)`
- Local path: `.loop/telemetry/pr-babysitter.jsonl`

Telemetry event fields are limited to:
- timestamp;
- repository + PR number;
- head SHA;
- decision/action;
- reason code;
- failure category;
- check IDs;
- retry/repair counters;
- elapsed milliseconds;
- optional token input/output totals supplied by the host;
- human-intervention boolean/reason code.

- [ ] **Step 1: Write failing telemetry tests**

Assert exact-key validation, append-only JSONL, redaction/no secret-like values, no review bodies/log bodies/task prompts, bounded line size, and deterministic summary metrics.

- [ ] **Step 2: Run tests and verify they fail**

```bash
node --test scripts/loop/__tests__/telemetry.test.mjs
```

- [ ] **Step 3: Implement telemetry and summary metrics**

Summary must calculate at least:
- observation count;
- flaky retries;
- repair requests;
- escalations by category;
- median repair attempts before green;
- human-intervention rate.

- [ ] **Step 4: Run tests and verify they pass**

- [ ] **Step 5: Commit**

```bash
git add scripts/loop/telemetry.mjs scripts/loop/__tests__/telemetry.test.mjs
git commit -m "feat(loop): add PR babysitter telemetry"
```

---

### Task 6: Update the Phase 2 operating contract

**Files:**
- Modify: `.agent/loops/pr-babysitter.md`
- Modify: `AGENTS.md`
- Create: `scripts/loop/__tests__/pr-contracts.test.mjs`
- Modify as appropriate: `Wiki/concepts/loop-engineering.md`
- Modify as appropriate: `Wiki/architecture.md`
- Modify: `Wiki/log.md`

**Interfaces:**
- Documents the executable Phase 2A core and explicitly separates it from GitHub write integration in Phase 2B.

- [ ] **Step 1: Write failing contract tests**

Assert docs specify:
- exact decision actions;
- revision binding;
- review-text trust boundary;
- no GitHub writes in Phase 2A;
- no merge/production mutation;
- escalation packet requirements;
- telemetry privacy rules;
- Phase 2B dependency for rerun/push operations.

- [ ] **Step 2: Run tests and verify they fail**

```bash
node --test scripts/loop/__tests__/pr-contracts.test.mjs
```

- [ ] **Step 3: Update documentation**

Keep operational docs concise; link to the approved foundation spec and this implementation plan instead of duplicating them.

- [ ] **Step 4: Run tests and verify they pass**

- [ ] **Step 5: Commit**

```bash
git add .agent/loops/pr-babysitter.md AGENTS.md scripts/loop/__tests__/pr-contracts.test.mjs Wiki
git commit -m "docs(loop): define Phase 2 PR babysitter contract"
```

---

### Task 7: Verify Phase 2A as a standalone deliverable

**Files:** verify-only unless a real defect is found.

- [ ] **Step 1: Run all Phase 1 + Phase 2A control-plane tests**

Run the existing Loop Foundation suite plus:
- `pr-evidence.test.mjs`
- `pr-state.test.mjs`
- `pr-babysitter.test.mjs`
- `pr-packets.test.mjs`
- `telemetry.test.mjs`
- `pr-contracts.test.mjs`

Expected: all PASS.

- [ ] **Step 2: Exercise fixture scenarios**

Use pure fixtures for:
- green PR;
- stale CI result;
- flaky fail-after-pass;
- branch-caused unit failure;
- infrastructure outage;
- protected-path failure;
- mixed failure batch;
- retry exhaustion.

Expected: every scenario produces one deterministic action and stable reason code.

- [ ] **Step 3: Review non-goals**

Confirm no GitHub API write, push, merge, model invocation, production credential, workflow mutation, or product-code change was added.

- [ ] **Step 4: Record baseline Phase 2A metrics**

Capture test duration and fixture decision coverage as the baseline for Phase 2B integration.

## Self-Review Result

- Phase 2A is independently testable and useful without GitHub credentials.
- It reuses Phase 1 classification/budget/security contracts instead of duplicating them.
- Stale-revision, duplicate-delivery, mixed-failure, untrusted-review, and sensitive-log cases have explicit tests.
- All GitHub write behavior is deferred to Phase 2B, keeping privilege boundaries reviewable.
