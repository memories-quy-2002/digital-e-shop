# Loop Engineering Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a bounded, deterministic Loop Engineering foundation to Digital-E Shop so agentic work can be risk-classified, budgeted, verified, persisted, and escalated without gaining merge or production-mutation authority.

**Architecture:** Keep `client/` and `server/` as independent pnpm packages and add a dependency-free Node.js control plane under `scripts/loop/`. Policy lives in JSON-compatible YAML files under `.agent/policy/`; pure modules implement risk classification, state/budget handling, failure fingerprinting, verification planning, and the loop state machine. Existing GitHub CI remains authoritative; Phase 1 adds only a read-only foundation test job after the explicit workflow human gate.

**Tech Stack:** Node.js 24.20.x built-ins (`node:test`, `node:assert`, `node:crypto`, `node:fs`, `node:child_process`), ECMAScript modules, pnpm 12.4.2 package-local commands, GitHub Actions, Vitest in existing client/server packages.

**Spec:** `docs/superpowers/specs/2026-09-27-loop-engineering-foundation-design.md`

## Global Constraints

- Keep `client/` and `server/` as independent pnpm package roots; do not add a root pnpm workspace.
- Use Node.js `24.20.x` and pnpm `12.4.2` for repository verification.
- Do not add Jest; existing product tests stay on Vitest.
- Do not add a YAML dependency in Phase 1. Policy files use JSON syntax, which is valid YAML 1.2, so runtime loading remains dependency-free with `JSON.parse`.
- Do not weaken, skip, or rewrite existing client/server CI checks, CodeQL default setup, or dependency review.
- Do not auto-merge, push directly to `main`, run production migrations, mutate production data, promote production deployments, or access production secrets.
- A deterministic high/critical risk match may not be downgraded by model or user-text hints.
- Shell commands must be selected from a fixed command registry and executed with `shell: false`; never interpolate issue/PR text or changed filenames into command strings.
- Loop state and verification artifacts under `.loop/` are local runtime state and must remain gitignored.
- Protected workflow/config/database/payment/auth surfaces remain human-gated.
- Phase 1 does not implement GitHub issue dispatch, Draft PR creation, CI self-repair, or post-merge automation; those receive separate plans after Phase 1 telemetry is stable.

## Review Focus

1. **Windows paths and traversal-looking paths:** `client\\src\\x.ts`, `./server/src/x.ts`, and normalized POSIX equivalents must classify identically and must not escape policy matching. Covered in Task 2.
2. **Untrusted filenames/task text:** a path containing shell metacharacters must never alter a spawned command or become a shell fragment. Covered in Task 4.
3. **Corrupt or partial state writes:** a malformed state file must fail closed with an escalation-compatible error rather than silently resetting progress. Covered in Task 3.
4. **Noisy repeated failures:** absolute temp paths, ANSI escapes, timestamps, and durations must not defeat same-failure detection, while materially different failures must not collide. Covered in Task 3.
5. **Sensitive/huge verification output:** evidence must redact common secret-bearing headers/assignments and truncate retained stdout/stderr to a bounded size without changing pass/fail status. Covered in Task 4.

---

### Task 1: Add dependency-free policy loading and versioned policy files

**Files:**
- Create: `.agent/policy/protected-paths.yml`
- Create: `.agent/policy/risk-rules.yml`
- Create: `.agent/policy/stop-conditions.yml`
- Create: `scripts/loop/policy.mjs`
- Create: `scripts/loop/__tests__/policy.test.mjs`

**Interfaces:**
- Produces: `loadLoopPolicy(repoRoot?: string): Promise<LoopPolicy>`
- Produces: `parsePolicyDocument(text: string, source: string): object`
- Produces `LoopPolicy` shape:
  - `schemaVersion: 1`
  - `protectedPaths: { high: string[]; critical: string[] }`
  - `riskRules: { low: string[]; medium: string[]; high: string[]; criticalActions: string[] }`
  - `stopConditions: { maxIterations: number; maxSameFailure: number; maxFlakyRetries: number; maxChangedFiles: number; maxChangedLines: number; maxWallClockSeconds: number }`

- [ ] **Step 1: Write failing policy-loader tests**

In `scripts/loop/__tests__/policy.test.mjs`, test:

- all three checked-in policy files load into one `LoopPolicy`;
- `schemaVersion` must equal `1`;
- malformed JSON-compatible YAML throws `PolicyParseError` with the source path;
- missing required top-level keys throw `PolicyValidationError`;
- numeric stop conditions must be positive integers.

Use `node:test` and `node:assert/strict`.

- [ ] **Step 2: Run the policy tests and verify they fail**

Run:

```bash
node --test scripts/loop/__tests__/policy.test.mjs
```

Expected: FAIL because `scripts/loop/policy.mjs` and policy documents do not exist.

- [ ] **Step 3: Implement the three policy documents**

Use JSON object syntax inside the `.yml` files so they are both valid YAML 1.2 and directly parseable by `JSON.parse`.

Initial protected/high patterns must include:

```text
.github/workflows/**
client/vercel.json
server/vercel.json
server/src/database/prisma/schema.prisma
server/src/database/migrations/**
server/src/database/seeders/**
server/src/payments/**
server/src/guards/**
server/src/middleware/**
server/src/auth/**
server/src/checkout/**
server/src/orders/**
server/src/inventory/**
server/src/**/*.repository.ts
client/src/**/auth/**
client/src/services/**
```

Critical actions must include production secret access, production DB mutation/reset, branch-protection bypass, direct push to `main`, security-check disablement, and production deployment promotion.

Use the spec defaults for stop conditions: 5 implementation iterations, 2 same-failure attempts, 3 flaky retries, 25 changed files, 1,000 changed lines. Set `maxWallClockSeconds` to a conservative initial value of `1800` and keep it configurable.

- [ ] **Step 4: Implement `loadLoopPolicy` and validation**

`parsePolicyDocument(text, source)` must parse JSON-compatible YAML with `JSON.parse`, wrap syntax errors in `PolicyParseError`, and never evaluate code.

`loadLoopPolicy(repoRoot)` must resolve only the three fixed policy paths above and validate the exact required shape.

- [ ] **Step 5: Run the policy tests and verify they pass**

Run:

```bash
node --test scripts/loop/__tests__/policy.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit Task 1**

```bash
git add .agent/policy scripts/loop/policy.mjs scripts/loop/__tests__/policy.test.mjs
git commit -m "feat(loop): add versioned loop policies"
```

---

### Task 2: Implement deterministic risk classification

**Files:**
- Create: `scripts/loop/classify-risk.mjs`
- Create: `scripts/loop/__tests__/classify-risk.test.mjs`

**Interfaces:**
- Consumes: `LoopPolicy` from Task 1.
- Produces: `normalizeRepoPath(path: string): string`
- Produces: `classifyRisk(input: { paths: string[]; actions?: string[]; hintedRisk?: "low" | "medium" | "high" | "critical" }, policy: LoopPolicy): RiskResult`
- Produces `RiskResult`:
  - `level: "low" | "medium" | "high" | "critical"`
  - `requiresHumanApproval: boolean`
  - `reasons: string[]`
  - `matchedRules: string[]`

- [ ] **Step 1: Write failing risk-classifier tests**

Cover:

- docs-only path -> `low`;
- ordinary non-sensitive client feature path -> `medium`;
- `.github/workflows/ci.yml` -> `high`;
- `server/src/payments/payos.service.ts` -> `high`;
- production reset action -> `critical`;
- mixed low + high paths -> `high`;
- `hintedRisk: "low"` cannot downgrade a deterministic high/critical match;
- Windows separator and `./` normalization produce the same result;
- `../` traversal segments are rejected instead of normalized outside the repository.

- [ ] **Step 2: Run the risk tests and verify they fail**

Run:

```bash
node --test scripts/loop/__tests__/classify-risk.test.mjs
```

Expected: FAIL because the classifier does not exist.

- [ ] **Step 3: Implement path normalization and deterministic precedence**

Risk ordering is fixed:

```text
low < medium < high < critical
```

The highest deterministic match wins. `hintedRisk` may only raise the result, never lower it.

Do not use filesystem glob libraries. Implement only the small policy matcher needed by the checked-in patterns: exact path, prefix `/**`, suffix filename match, and `**/*.repository.ts`-style segment suffix match. Reject unsupported policy pattern forms during Task 1 validation.

- [ ] **Step 4: Run the risk tests and verify they pass**

Run:

```bash
node --test scripts/loop/__tests__/classify-risk.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add scripts/loop/classify-risk.mjs scripts/loop/__tests__/classify-risk.test.mjs
git commit -m "feat(loop): add deterministic risk classification"
```

---

### Task 3: Add durable state, budget enforcement, and stable failure fingerprints

**Files:**
- Create: `scripts/loop/fingerprint-failure.mjs`
- Create: `scripts/loop/state.mjs`
- Create: `scripts/loop/__tests__/fingerprint-failure.test.mjs`
- Create: `scripts/loop/__tests__/state.test.mjs`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: stop-condition values from `LoopPolicy`.
- Produces: `fingerprintFailure(input: { commandId: string; exitCode: number; stdout?: string; stderr?: string }): string`
- Produces: `createLoopState(input): LoopState`
- Produces: `loadLoopState(repoRoot: string, taskId: string): Promise<LoopState>`
- Produces: `saveLoopState(repoRoot: string, state: LoopState): Promise<void>`
- Produces: `recordFailure(state: LoopState, fingerprint: string): LoopState`
- Produces: `recordTokenUsage(state: LoopState, usage: { inputTokens?: number; outputTokens?: number }): LoopState`
- Produces: `evaluateBudgets(state: LoopState, policy: LoopPolicy, diff?: { changedFiles: number; additions: number; deletions: number }): StopDecision`
- Produces `StopDecision`: `{ stop: boolean; reason: string | null }`

- [ ] **Step 1: Write failing failure-fingerprint tests**

Assert:

- the same compiler/test error with different absolute workspace paths, ANSI color codes, timestamps, and duration values yields the same SHA-256 fingerprint;
- different error codes/messages yield different fingerprints;
- command ID and exit code participate in the fingerprint.

- [ ] **Step 2: Write failing state/budget tests**

Assert:

- new state has `schemaVersion: 1`, iteration `0`, empty failure counts, optional token budget fields, and a valid timestamp;
- save uses `.loop/state/<safe-task-id>.json`;
- load round-trips state;
- malformed JSON causes a `LoopStateCorruptError` instead of silently replacing state;
- unsafe task IDs containing separators or traversal are rejected;
- same fingerprint reaching the configured limit returns `stop: true`;
- iteration, wall-clock, token-limit, changed-file, and changed-line budgets independently stop;
- unset token limits do not stop token usage tracking.

- [ ] **Step 3: Run Task 3 tests and verify they fail**

Run:

```bash
node --test scripts/loop/__tests__/fingerprint-failure.test.mjs scripts/loop/__tests__/state.test.mjs
```

Expected: FAIL because the modules do not exist.

- [ ] **Step 4: Implement stable failure normalization and hashing**

Normalize only noise known to be unstable: ANSI escapes, repository/workspace absolute prefixes, ISO timestamps, and timing values. Preserve diagnostic codes, filenames relative to repo, assertions, exit code, and command ID.

Hash the normalized payload with `node:crypto` SHA-256.

- [ ] **Step 5: Implement atomic state persistence and budgets**

`saveLoopState` must:

1. create `.loop/state/` recursively;
2. write to a sibling temporary file;
3. atomically rename it over the final file.

Never persist raw prompt history, environment values, cookies, tokens, or production payloads.

Add this entry to the root `.gitignore`:

```gitignore
.loop/
```

- [ ] **Step 6: Run Task 3 tests and verify they pass**

Run:

```bash
node --test scripts/loop/__tests__/fingerprint-failure.test.mjs scripts/loop/__tests__/state.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit Task 3**

```bash
git add .gitignore scripts/loop/fingerprint-failure.mjs scripts/loop/state.mjs scripts/loop/__tests__/fingerprint-failure.test.mjs scripts/loop/__tests__/state.test.mjs
git commit -m "feat(loop): persist bounded loop state"
```

---

### Task 4: Build safe fast/full verification planning and execution

**Files:**
- Create: `scripts/loop/verify.mjs`
- Create: `scripts/loop/__tests__/verify.test.mjs`

**Interfaces:**
- Consumes: `LoopPolicy` and normalized changed paths.
- Produces: `buildVerificationPlan(input: { changedPaths: string[]; mode: "fast" | "full"; includeIntegration?: boolean }): VerificationPlan`
- Produces: `runVerificationPlan(plan: VerificationPlan, options?: { cwd?: string; maxOutputBytes?: number }): Promise<VerificationResult>`
- Produces: `redactVerificationOutput(text: string): string`
- Produces `VerificationPlan` entries with fixed `id`, `command`, `args`, `cwd`, and optional `requires`.
- Produces `VerificationResult` with `passed`, `complete`, per-command exit codes/durations, bounded/redacted stdout/stderr, and `requiredExternalChecks`.

- [ ] **Step 1: Write failing verification-planner tests**

Assert routing:

- docs/policy-only change -> control-plane Node tests only;
- client-only fast -> client typecheck + lint + targeted/full-package Vitest command, but no server commands;
- client-only full -> client typecheck + lint + full Vitest + build;
- server-only fast -> server typecheck + lint + Vitest;
- server-only full -> server Prisma validation + typecheck + lint + full Vitest + build, plus integration requirement;
- DB-related server path -> Prisma validation is mandatory;
- mixed client/server -> both package plans;
- changed filenames containing `; rm -rf`, quotes, spaces, or shell metacharacters do not appear in `command` or `args`;
- every command ID maps to a fixed allowlisted executable/argument vector.

Use the repository's current commands, including:

```text
pnpm --dir client exec tsc -p tsconfig.json --noEmit
pnpm --dir client lint
pnpm --dir client test -- --run
pnpm --dir client build
pnpm --dir server prisma:validate
pnpm --dir server typecheck
pnpm --dir server lint
pnpm --dir server test -- --run
pnpm --dir server test:integration
pnpm --dir server build
```

- [ ] **Step 2: Write failing runner-output safety tests**

Use a stub command runner or a child Node fixture and assert:

- `shell` is never enabled;
- output containing `Authorization: Bearer ...`, `Cookie: ...`, `JWT_SECRET_KEY=...`, `DATABASE_URL=...`, and common API/token assignments is redacted;
- retained stdout/stderr is truncated to a fixed default maximum while exit code/pass-fail remains accurate;
- a missing integration prerequisite makes `complete: false`; it must never be reported as a fully verified pass.

- [ ] **Step 3: Run verification tests and verify they fail**

Run:

```bash
node --test scripts/loop/__tests__/verify.test.mjs
```

Expected: FAIL because `verify.mjs` does not exist.

- [ ] **Step 4: Implement the immutable command registry and planner**

Keep all executable names and args in source-controlled constants. Changed paths only decide which existing command IDs are selected.

Fast mode may skip expensive cross-package checks. Full mode must include all package-local checks for the touched surface.

For server integration, use `includeIntegration: true` only when a disposable MySQL target is deliberately available. Otherwise return it in `requiredExternalChecks` and set `complete: false` so GitHub CI remains authoritative.

- [ ] **Step 5: Implement execution, output redaction, and bounded evidence**

Use `spawn`/equivalent with `shell: false`.

Default retained output budget: 64 KiB per stream per command. Store truncation metadata.

Do not log the full process environment.

- [ ] **Step 6: Add a dry-run CLI**

Support:

```bash
node scripts/loop/verify.mjs --mode fast --changed client/src/features/products/ProductCard.tsx
node scripts/loop/verify.mjs --mode full --changed server/src/orders/orders.service.ts
```

`--changed` values influence routing only; they never become command arguments.

Dry-run prints the verification plan without spawning product commands.

- [ ] **Step 7: Run verification tests and verify they pass**

Run:

```bash
node --test scripts/loop/__tests__/verify.test.mjs
```

Expected: PASS.

- [ ] **Step 8: Smoke the dry-run CLI**

Run:

```bash
node scripts/loop/verify.mjs --dry-run --mode full --changed client/src/features/products/ProductCard.tsx
node scripts/loop/verify.mjs --dry-run --mode full --changed server/src/orders/orders.service.ts
```

Expected: first output contains only client/control-plane commands; second contains only server/control-plane commands plus the integration requirement when not enabled.

- [ ] **Step 9: Commit Task 4**

```bash
git add scripts/loop/verify.mjs scripts/loop/__tests__/verify.test.mjs
git commit -m "feat(loop): add safe verification router"
```

---

### Task 5: Implement the bounded loop state machine

**Files:**
- Create: `scripts/loop/controller.mjs`
- Create: `scripts/loop/__tests__/controller.test.mjs`

**Interfaces:**
- Consumes: `RiskResult`, `LoopState`, `StopDecision`, and `VerificationResult`.
- Produces: `advanceLoop(state: LoopState, event: LoopEvent, context: LoopContext): LoopState`
- Produces event types:
  - `TASK_ACCEPTED`
  - `IMPLEMENTATION_STARTED`
  - `VERIFICATION_STARTED`
  - `VERIFICATION_PASSED`
  - `VERIFICATION_FAILED`
  - `PROTECTED_PATH_DETECTED`
  - `BUDGET_EXHAUSTED`
  - `HUMAN_ESCALATION_REQUIRED`
- Phase values: `inspect | implement | verify | repair | done | escalated`.

- [ ] **Step 1: Write failing controller tests**

Assert:

- low-risk happy path traverses `inspect -> implement -> verify -> done`;
- first actionable verification failure goes `verify -> repair`;
- repair returns to `verify`;
- repeated same failure at the configured threshold ends in `escalated`;
- high/critical task cannot enter `implement` without an explicit approved execution context;
- protected path detection escalates before a write phase;
- any exhausted budget escalates;
- `VERIFICATION_PASSED` with `complete: false` does not reach `done`;
- terminal `done` and `escalated` states reject further mutation events.

- [ ] **Step 2: Run controller tests and verify they fail**

Run:

```bash
node --test scripts/loop/__tests__/controller.test.mjs
```

Expected: FAIL because the controller does not exist.

- [ ] **Step 3: Implement the explicit state transition table**

Use a small transition table/switch, not a general state-machine dependency.

The controller does not invoke an LLM or GitHub. It enforces legal phases and stop/escalation behavior around whichever agent runner is used later.

- [ ] **Step 4: Run controller tests and verify they pass**

Run:

```bash
node --test scripts/loop/__tests__/controller.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit Task 5**

```bash
git add scripts/loop/controller.mjs scripts/loop/__tests__/controller.test.mjs
git commit -m "feat(loop): add bounded loop controller"
```

---

### Task 6: Document the runtime contract and add an agent-ready issue schema

**Files:**
- Modify: `AGENTS.md`
- Create: `.agent/loops/feature.md`
- Create: `.agent/loops/pr-babysitter.md`
- Create: `.github/ISSUE_TEMPLATE/agent-task.yml`
- Create: `scripts/loop/__tests__/contracts.test.mjs`

**Interfaces:**
- Consumes: policy/risk/state/verification/controller contracts from Tasks 1-5.
- Produces: repository-level human/agent operating contract.
- Produces issue fields:
  - Goal
  - Context
  - Acceptance criteria
  - Non-goals
  - Constraints
  - Verification
  - Risk notes

- [ ] **Step 1: Write failing contract tests**

Read the files from disk and assert:

- `AGENTS.md` contains a `## Loop Engineering contract` section;
- the section says deterministic verification is authoritative, retries are bounded, state lives under `.loop/`, and high/critical/protected work requires human approval;
- `.agent/loops/feature.md` includes Input, Inspect, Implement, Verify, Repair, Stop, Escalate, and Never sections;
- `.agent/loops/pr-babysitter.md` distinguishes `branch-caused`, `flaky`, `infrastructure`, `protected`, and `ambiguous`;
- issue template IDs `goal`, `acceptance_criteria`, `non_goals`, `constraints`, `verification`, and `risk_notes` exist and required fields are marked required;
- the template does not assign an `agent-ready` label automatically in Phase 1 because issue dispatch is not yet enabled.

- [ ] **Step 2: Run contract tests and verify they fail**

Run:

```bash
node --test scripts/loop/__tests__/contracts.test.mjs
```

Expected: FAIL because the new contract files/section do not exist.

- [ ] **Step 3: Update `AGENTS.md` with the Loop Engineering contract**

Document:

- risk-before-write;
- context minimization;
- fast verification during repair, full verification before handoff;
- maximum iteration/same-failure behavior comes from policy;
- never disable tests/typecheck/security checks to make a loop pass;
- never self-modify policy and immediately execute under the new policy;
- state and token accounting fields are compact summaries, not prompt-history storage;
- high/critical/protected surfaces require human approval;
- merge and production operations remain human-controlled.

Do not duplicate the entire design spec in `AGENTS.md`; keep this section operational.

- [ ] **Step 4: Add the feature and PR-babysitter loop documents**

`feature.md` defines the inner loop contract that Phase 1 can enforce.

`pr-babysitter.md` is documentation-only in Phase 1; its executable implementation is deferred to the Phase 2 plan.

- [ ] **Step 5: Add the GitHub issue template**

Create a valid GitHub issue form named `Agent Task`. It captures machine-verifiable acceptance criteria but does not trigger automation or auto-labeling yet.

- [ ] **Step 6: Run contract tests and verify they pass**

Run:

```bash
node --test scripts/loop/__tests__/contracts.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit Task 6**

```bash
git add AGENTS.md .agent/loops .github/ISSUE_TEMPLATE/agent-task.yml scripts/loop/__tests__/contracts.test.mjs
git commit -m "docs(loop): define agent loop contract"
```

---

### Task 7: Add a read-only CI gate for the Loop Engineering foundation

**Human gate:** This task modifies `.github/workflows/**`, which the policy classifies as high risk. Do not start this task until the human explicitly approves execution of the implementation plan/workflow change. The workflow itself receives no write permission and no production secrets.

**Files:**
- Create: `.github/workflows/loop-foundation.yml`

**Interfaces:**
- Consumes: all Task 1-6 control-plane tests.
- Produces: PR-only/push-to-main read-only CI status `Loop Foundation / test`.

- [ ] **Step 1: Define the expected workflow contract before writing it**

The workflow must:

- trigger on `pull_request` to `main` and `push` to `main`;
- use `ubuntu-24.04`;
- set top-level or job-level `permissions: contents: read`;
- use the repository-pinned Node `24.20.0`;
- not install client/server dependencies;
- not expose secrets;
- run the six explicit Node test files from Tasks 1-6;
- run two `verify.mjs --dry-run` routing smoke commands;
- never invoke an agent, mutate GitHub state, or run production operations.

- [ ] **Step 2: Create the workflow**

Run these test files explicitly to keep behavior cross-platform and independent of shell glob expansion:

```bash
node --test \
  scripts/loop/__tests__/policy.test.mjs \
  scripts/loop/__tests__/classify-risk.test.mjs \
  scripts/loop/__tests__/fingerprint-failure.test.mjs \
  scripts/loop/__tests__/state.test.mjs \
  scripts/loop/__tests__/verify.test.mjs \
  scripts/loop/__tests__/controller.test.mjs \
  scripts/loop/__tests__/contracts.test.mjs
```

Then run the client/server dry-run routing smoke from Task 4.

- [ ] **Step 3: Inspect the workflow diff for privilege creep**

Confirm:

- no `contents: write`;
- no `pull-requests: write`;
- no `issues: write`;
- no `id-token: write`;
- no `environment: production`;
- no `secrets.*`;
- no `pull_request_target`.

- [ ] **Step 4: Commit Task 7**

```bash
git add .github/workflows/loop-foundation.yml
git commit -m "ci(loop): verify loop foundation"
```

---

### Task 8: Run the complete foundation verification and prepare the branch for review

**Files:**
- Verify only; modify files only if a failing test reveals a real Task 1-7 defect.

**Interfaces:**
- Consumes: all Phase 1 deliverables.
- Produces: evidence that the foundation satisfies the spec's Phase 1 Definition of Done.

- [ ] **Step 1: Run all control-plane tests**

Run:

```bash
node --test \
  scripts/loop/__tests__/policy.test.mjs \
  scripts/loop/__tests__/classify-risk.test.mjs \
  scripts/loop/__tests__/fingerprint-failure.test.mjs \
  scripts/loop/__tests__/state.test.mjs \
  scripts/loop/__tests__/verify.test.mjs \
  scripts/loop/__tests__/controller.test.mjs \
  scripts/loop/__tests__/contracts.test.mjs
```

Expected: all PASS.

- [ ] **Step 2: Run routing smoke checks**

Run:

```bash
node scripts/loop/verify.mjs --dry-run --mode fast --changed client/src/features/products/ProductCard.tsx
node scripts/loop/verify.mjs --dry-run --mode full --changed server/src/orders/orders.service.ts
node scripts/loop/verify.mjs --dry-run --mode full --changed .github/workflows/ci.yml
```

Expected:

- client path routes only to client/control-plane verification;
- server path routes only to server/control-plane verification and explicitly reports integration as required when it cannot run locally;
- workflow path is classified high/protected before any write-capable loop would execute it.

- [ ] **Step 3: Exercise state-machine fixture scenarios**

Use the controller/state unit tests as executable evidence for:

- low-risk inspect -> implement -> verify -> done;
- repeated deterministic failure -> escalated;
- protected path -> escalated;
- incomplete verification -> not done;
- budget exhausted -> escalated.

Do not create a fake autonomous model adapter solely for this test.

- [ ] **Step 4: Run existing repository CI-equivalent checks only for touched product surfaces**

Phase 1 should not touch product code in `client/src` or `server/src`. Therefore local product builds are not required solely for the control-plane branch. The PR must still run the repository's existing CI client/server jobs, security dependency review, and CodeQL default setup before merge.

If implementation unexpectedly touches product code, stop and run the full relevant package verification from `AGENTS.md` before continuing.

- [ ] **Step 5: Review the final diff against non-goals**

Confirm no:

- root workspace/package-manager conversion;
- new third-party runtime dependency;
- Jest addition;
- auto-merge;
- GitHub write token;
- production secret;
- production DB action;
- `pull_request_target`;
- security-check bypass;
- self-modifying active policy behavior.

- [ ] **Step 6: Record Phase 2 follow-up inputs**

Before starting a separate PR-babysitter plan, record from real Phase 1 usage:

- average verification duration;
- first-pass success rate;
- median repair iterations;
- repeated-failure escalation frequency;
- changed-file/LOC budget false positives;
- token usage where the executing agent exposes it;
- human intervention reasons.

Do not implement Phase 2 in this branch.

- [ ] **Step 7: Final review commit only if Task 8 required fixes**

If no files changed, do not create an empty commit.

If fixes were required:

```bash
git add <only-the-fixed-foundation-files>
git commit -m "fix(loop): address foundation verification findings"
```

---

## Deferred follow-up plans

These remain deliberately outside this implementation plan:

1. **Phase 2 — PR Babysitter:** GitHub CI/review event ingestion, failure classification, bounded flaky retry, same-branch repair, and escalation packets.
2. **Phase 3 — Issue to Draft PR:** validated `agent-ready` issue dispatch, worktree provisioning, agent runner adapter, bounded context packets, Draft PR creation, and token/CI telemetry.
3. **Phase 4 — Post-merge Evidence Loop:** deployment-status observation, safe smoke/browser verification, regression issue creation, and read-only performance evidence.

Each phase should receive its own spec review/update if Phase 1 telemetry changes the architecture, then its own Superpowers implementation plan.

## Self-Review Result

- **Spec coverage:** Phase 1 requirements are covered by Tasks 1-8; Phase 2-4 are explicitly deferred rather than partially implemented.
- **Step scan:** Each code task follows failing test -> implementation -> passing test -> commit. Documentation/config tasks have executable contract checks or explicit privilege review.
- **Type/interface consistency:** `LoopPolicy`, `RiskResult`, `LoopState`, `StopDecision`, `VerificationPlan`, and `VerificationResult` flow in one direction across tasks without duplicate ownership.
- **Review Focus:** all five high-risk input/failure classes are pinned to concrete tests.
- **Proportion:** the plan specifies decisions, interfaces, assertions, commands, and boundaries without transcribing implementation bodies.
