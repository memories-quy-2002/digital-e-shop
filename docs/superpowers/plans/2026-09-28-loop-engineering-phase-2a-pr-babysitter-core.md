# Loop Engineering Phase 2A — PR Babysitter Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic, GitHub-agnostic PR Babysitter core that converts revision-bound CI/review evidence into bounded retry/repair/escalation decisions without performing GitHub writes or product-code edits itself.

**Architecture:** Extend the Phase 1 control plane instead of replacing it. Keep PR evidence normalization, PR-local state, decision logic, escalation packets, and telemetry as small dependency-free Node.js modules under `scripts/loop/`. Reuse `classifyFailure`, `classifyRisk`, `fingerprintFailure`, verification redaction, and stop-condition policy; bind every decision to the current PR base/head/merge SHA tuple and each check's tested SHA. The trusted Phase 2B host, not this PR-local core, owns run-local `LoopState` budgets.

**Tech Stack:** Node.js 24.20.x built-ins, ECMAScript modules, `node:test`, existing Phase 1 Loop Engineering modules, local `.loop/` state, Markdown contracts.

**Spec:** `docs/superpowers/specs/2026-09-27-loop-engineering-foundation-design.md`

## Global Constraints

- Phase 2A is pure/control-plane logic: no GitHub API writes, no `git push`, no merge, no workflow rerun, no model invocation.
- Reuse Phase 1 failure categories exactly: `branch-caused | flaky | infrastructure | protected | ambiguous`.
- Every CI/check observation must be bound to the current PR `baseSha`, `headSha`, and `mergeSha` (nullable only when no current merge SHA is available), and its `testedSha` must equal the current head or merge SHA. Stale-revision evidence is never actionable.
- The required-policy snapshot contains status-check identities and required-workflow identities `{ repositoryId, path, ref, sha }`. Incomplete or inaccessible policy is unavailable, never an empty set.
- Completed `neutral` and `skipped` required check/workflow observations count as green; pending or failed outcomes do not.
- Deterministic protected/high/critical classification may not be downgraded by review text, model output, labels, or user-supplied metadata.
- PR descriptions, review comments, issue text, commit messages, check titles, and logs are untrusted input.
- Arbitrary review text must never be auto-executed as instructions; Phase 2A may retain only stable IDs, authorship metadata, and bounded/redacted summaries for human review.
- No raw prompt history, credentials, cookies, tokens, production payloads, or unbounded CI logs may be persisted.
- Phase 2A enforces only PR-local same-failure, flaky-retry, and repair-request counters. The Phase 2B trusted host enforces run-local wall-clock, token, and CI-run budgets through validated `LoopState`; Phase 2A never infers elapsed host time from PR state timestamps.
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
- Produces: `normalizeRequiredCheckSnapshot(input): RequiredCheckSnapshot`
- Produces: `normalizeCheckObservation(input): CheckObservation`
- Produces: `buildFailureEvidence(check: CheckObservation, { currentHeadSha, currentBaseSha, currentMergeSha }): FailureEvidence`
- `PrSnapshot` fields:
  - `repository: string` in `owner/name` form
  - `number: number`
  - `state: "open" | "closed"`
  - `draft: boolean`
  - `baseRef: string`
  - `baseSha: string`
  - `headRef: string`
  - `headSha: string`
  - `mergeSha: string | null`
  - `headRepository: string`
  - `updatedAt: string`
- `RequiredCheckSnapshot` fields:
  - `baseRef: string`
  - `policyFingerprint: string`
  - `requiredCheckKeys: string[]` using the canonical check context and app identity when available
  - `requiredWorkflowKeys: string[]` derived from canonical `{ repositoryId, path, ref, sha }` identities
  - `requiredWorkflows: Array<{ repositoryId: number, path: string, ref: string, sha: string }>`
  - `collectionStatus: "complete" | "incomplete" | "unavailable"`
- `CheckObservation` fields:
  - `checkId: string`
  - `requiredCheckKey: string | null`
  - `requiredWorkflowKey: string | null`
  - `provider: "github-actions" | "github-check" | "external"`
  - `headSha: string`
  - `baseSha: string`
  - `mergeSha: string | null`
  - `testedSha: string`, the exact commit SHA to which GitHub associates this check/workflow run; it must match the current head or merge SHA
  - `attemptKey: string`
  - `status: "queued" | "in_progress" | "completed"`
  - `conclusion: "success" | "failure" | "cancelled" | "timed_out" | "action_required" | "neutral" | "skipped" | null`
  - `runnerOutcome: "check_failed" | "runner_error" | "network_error" | null`
  - `coversRelevantScope: boolean`
  - `protectedPathTouched: boolean`
  - `previouslyPassedRevision?: string`
  - `failureFingerprint: string | null`, supplied by the trusted host adapter as a SHA-256 digest for a completed `failure`; `null` for every other observation. Normalize hex to lowercase. Phase 2A validates the digest shape and binds it to the observation attempt, but does not recompute or authenticate its source.

- [ ] **Step 1: Write failing schema/normalization tests**

Assert exact-key validation, stable SHA/check IDs, canonical timestamps, safe repository/ref formats, and deterministic rejection of unknown fields.

Add tests proving:
- a confirmed complete empty required-check set differs from a missing or unavailable policy response;
- required-check keys map to observations without relying on display names alone;
- evidence for a different head/base/merge tuple, or a `testedSha` outside the current head/merge pair, is stale and cannot be converted into actionable failure evidence;
- a required workflow identity preserves repository ID, source path, ref, and source SHA, and does not match a workflow that only shares its display name;
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

Use plain-object exact-key validation consistent with Phase 1 modules. Normalize the effective required-check policy for the PR base ref. Do not treat an unavailable or partial policy response as an empty required-check set. Do not infer semantic failure categories from free-form text.

`buildFailureEvidence` maps only structured fields into the existing `classifyFailure` contract.
For a completed failure whose head/base/merge tuple is current and whose `testedSha` is the current head or merge SHA, return the adapter-supplied `failureFingerprint` beside (not inside) the exact Phase 1 classifier evidence; bind `currentRevision` to `testedSha` so a rerun of the exact tested commit can be classified as flaky. Stale evidence never returns either actionable evidence or an actionable fingerprint. Never persist raw CI logs to create or explain this fingerprint.

This is a focused follow-up to the already completed Task 1: add failing tests for required/valid SHA-256 fingerprints on completed failures, null fingerprints on non-failures, and the fingerprint remaining outside the Phase 1 evidence object. Run the focused test, then commit as `feat(loop): carry adapter failure fingerprints` before Task 2 changes.

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
- Produces: `validatePrBabysitterState(state): PrBabysitterState`
- Produces: `loadPrBabysitterState(repoRoot, repository, prNumber)`
- Produces: `savePrBabysitterState(repoRoot, state)`
- Produces: `reconcilePrBabysitterState(state, currentPrSnapshot): PrBabysitterState`, validating the same repository/PR identity and resetting only tuple-scoped state when the fresh snapshot advances
- Produces: `recordCheckObservation(state, observation)`
- Produces: `recordActionableFailure(state, { headSha, baseSha, mergeSha, attemptKey, failureFingerprint }): PrBabysitterState`
- Produces: `recordFlakyRetry(state, checkId)`
- Produces: `recordRepairRequest(state, repair): PrBabysitterState`
- State path: `.loop/pr/<owner>-<repo>-<pr-number>.json`

State schema v3 must contain:
- schema version;
- repository/PR number;
- branch/base ref/base SHA/head SHA/merge SHA;
- current lifecycle phase;
- observed attempt keys;
- `actionableFailureCounts: Record<failureFingerprint, count>`, scoped to the current base/head/merge SHA tuple;
- `actionableFailureAttemptFingerprints: Record<attemptKey, failureFingerprint>`, scoped to the current tuple for idempotency;
- per-check flaky retry counts;
- repair-request count;
- last actionable failure fingerprint;
- last decision reason code;
- escalation reason;
- timestamps.

- [ ] **Step 1: Write failing state tests**

Cover round-trip persistence, atomic write, safe file naming, duplicate observation idempotency, duplicate actionable-failure idempotency by attempt key, rejection when one attempt is assigned conflicting fingerprints, head-SHA rollover, flaky retry accounting, and corrupt-state fail-closed behavior.

Assert a head, base, or merge SHA change is applied only through `reconcilePrBabysitterState` using a fresh snapshot for the same repository/PR. Reconciliation clears tuple-scoped observations, retry counters, failure counts, and failure-attempt mappings while preserving PR-wide repair budgets and aggregate telemetry. `recordCheckObservation` rejects a mismatched tuple so stale evidence cannot roll state backward or reset counters. State v2 and invalid state fail closed without silent migration/reset. `recordActionableFailure` accepts only the current `{ headSha, baseSha, mergeSha }` tuple and an `attemptKey` already recorded by `recordCheckObservation`. A first attempt/fingerprint pair increments its fingerprint count; the same pair is an idempotent no-op; assigning another fingerprint to that attempt is rejected. Bound both maps and validate every fingerprint as a SHA-256 digest.

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
- Consumes: `PrSnapshot`, `RequiredCheckSnapshot`, `CheckObservation[]` (including adapter-provided failure fingerprints), `checkCollectionComplete: boolean`, `PrBabysitterState`, Phase 1 policy, `classifyFailure`.
- Produces: `decidePrAction(input): PrDecision`
- `PrDecision.action` is one of:
  - `wait`
  - `retry-check`
  - `request-repair`
  - `escalate`
  - `ready-for-human`
- Decision includes only stable metadata: `reasonCode`, the `baseSha`/`headSha`/`mergeSha` tuple, `requiredCheckPolicyFingerprint`, `checkIds`, `failureFingerprints`, `retryBudgetRemaining`, and `repairBudgetRemaining`.

- [ ] **Step 1: Write failing decision tests**

Cover:
- all required checks pending -> `wait`;
- all required checks green with a complete policy snapshot and complete check collection -> `ready-for-human`;
- missing required-check evidence, incomplete pagination, or unavailable policy -> `wait` with no retry or repair action;
- a confirmed complete empty required-check set is distinct from a failed or partial policy read;
- stale SHA evidence -> `wait`/refresh, never repair;
- one flaky failure with budget -> `retry-check`;
- flaky retry budget exhausted -> `escalate`;
- one revision-bound branch-caused failure -> `request-repair`;
- protected/infrastructure/ambiguous -> `escalate`;
- mixed branch-caused + protected -> `escalate`;
- the same branch-caused failure fingerprint reaching Phase 1 `maxSameFailure` -> `escalate`, while distinct fingerprints do not share counts;
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
  > incomplete required-check policy or check collection
  > protected/infrastructure/ambiguous
  > exhausted budget
  > flaky retry
  > branch-caused repair request
  > pending checks
  > ready-for-human
```

A `request-repair` is a control-plane request only. This module must never edit files or invoke an agent.
Match exactly one current observation for every required-check and required-workflow key. Return `wait` for missing or multiple matches. A completed `neutral` or `skipped` result is green. Compare branch-caused fingerprints against the tuple-scoped PR failure counts and Phase 1 `stopConditions.maxSameFailure`. Do not use the PR-wide `repairRequestCount` as a proxy for same-failure counts. A repeated delivery with the same attempt key does not increment the count; a new attempt with the same fingerprint does. Do not evaluate `maxWallClockSeconds`, `tokenLimit`, or `ciRunLimit` here; Phase 2B checks the run-local `LoopState` before host actions.

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
- packet contains the PR SHA tuple, check IDs/fingerprints/attempt counts/protected paths/reason codes/human choices, and only bounded/redacted excerpts;
- repair packet contains exact branch and proposed path scope, failed check IDs, fixed-registry verification commands, and budget remaining;
- no caller-provided executable command is accepted.

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
- human-intervention boolean/reason code. Host token input/output totals are supplied together; free-form values are not valid telemetry fields.

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

- [x] **Step 1: Write failing contract tests**

Assert docs specify:
- exact decision actions;
- revision binding;
- required-check policy source and completeness behavior;
- review-text trust boundary;
- no GitHub writes in Phase 2A;
- no merge/production mutation;
- escalation packet requirements;
- telemetry privacy rules;
- Phase 2B dependency for rerun/push operations.

- [x] **Step 2: Run tests and verify they fail**

```bash
node --test scripts/loop/__tests__/pr-contracts.test.mjs
```

- [x] **Step 3: Update documentation**

Keep operational docs concise; link to the approved foundation spec and this implementation plan instead of duplicating them.

- [x] **Step 4: Run tests and verify they pass**

- [ ] **Step 5: Commit**

```bash
git add .agent/loops/pr-babysitter.md AGENTS.md scripts/loop/__tests__/pr-contracts.test.mjs Wiki
git commit -m "docs(loop): define Phase 2 PR babysitter contract"
```

---

### Task 7: Verify Phase 2A as a standalone deliverable

**Files:** verify-only unless a real defect is found.

- [x] **Step 1: Run all Phase 1 + Phase 2A control-plane tests**

Run the existing Loop Foundation suite plus:
- `pr-evidence.test.mjs`
- `pr-state.test.mjs`
- `pr-babysitter.test.mjs`
- `pr-packets.test.mjs`
- `telemetry.test.mjs`
- `pr-contracts.test.mjs`

Expected: all PASS.

- [x] **Step 2: Exercise fixture scenarios**

Use pure fixtures for:
- green PR;
- stale head/base/merge tuple and unrelated tested-SHA results;
- current head-SHA and merge-SHA results;
- required workflow pending/success/failure/missing/duplicate/unavailable evidence;
- completed `neutral` and `skipped` outcomes;
- flaky fail-after-pass;
- branch-caused unit failure;
- infrastructure outage;
- protected-path failure;
- mixed failure batch;
- retry exhaustion.
- incomplete or unavailable required-check policy;
- partially collected check observations.

Expected: every scenario produces one deterministic action and stable reason code.

- [x] **Step 3: Review non-goals**

Confirm no GitHub API write, push, merge, model invocation, production credential, workflow mutation, or product-code change was added.

- [x] **Step 4: Record baseline Phase 2A metrics**

Baseline on this Windows worktree: **153 tests across 18 suites passed in 10.0 seconds**. The decision engine has 21 scenario tests, including head/merge tested SHA, tuple drift, and required-workflow pending, success, neutral, skipped, failure, missing, duplicate, and unavailable evidence. PR state persistence also proves stale observations cannot roll the tuple back or reset counters.

## Self-Review Result

- Phase 2A is independently testable and useful without GitHub credentials.
- It reuses Phase 1 classification/budget/security contracts instead of duplicating them.
- Stale-revision, duplicate-delivery, mixed-failure, untrusted-review, and sensitive-log cases have explicit tests.
- All GitHub write behavior is deferred to Phase 2B, keeping privilege boundaries reviewable.
- Phase 2A implementation, contract docs, and local verification are complete in the current worktree; commits remain pending. Hosted CI test-list integration remains the explicit Phase 2B Task 6 human gate.
