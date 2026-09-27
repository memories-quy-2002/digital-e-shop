# Loop Engineering Foundation Design

## Purpose

Apply Loop Engineering to Digital-E Shop as a bounded, auditable control plane around coding agents. The goal is not full autonomous production operation. The goal is to turn low- and medium-risk engineering tasks into evidence-backed Draft PRs while deterministic verification, explicit budgets, and human approval remain authoritative.

## Current repository baseline

This design is grounded in the current repository state:

- `client/` and `server/` are independent pnpm packages; there is no root workspace.
- Both packages pin pnpm 12.4.2 and Node 24.20.x.
- Frontend is React/Vite/TypeScript and uses Vitest + Testing Library.
- Backend is NestJS 11 on Express 5 with MySQL and a partial Prisma layer; server tests use Vitest.
- `.github/workflows/ci.yml` already verifies client typecheck/lint/test/build/preview smoke and server Prisma validation/migrations/typecheck/lint/unit/integration/build/health on disposable MySQL.
- CodeQL uses GitHub default setup; `.github/workflows/security.yml` performs dependency review.
- A push to `main` can trigger `production-migrate`, so agent-authored changes must not gain merge capability.
- `AGENTS.md` and `docs/CODEX_ORCHESTRATION.md` already define architecture, security boundaries, agent roles, file ownership, and verification reporting.

This design therefore reuses the existing verification foundation rather than replacing it.

## Intent and success criteria

The system should:

1. Convert a well-specified low/medium-risk task into an isolated branch/worktree execution.
2. Limit repository context and retries so token and CI consumption are bounded.
3. Use deterministic tools as the source of truth for correctness.
4. Persist minimal loop state outside the model context window.
5. Stop or escalate when failures repeat, scope expands, protected areas are implicated, or budgets are exhausted.
6. Produce a Draft PR with exact verification evidence.
7. Allow a PR babysitter to repair branch-caused CI failures without confusing flaky/infra failures with product defects.
8. Keep merge, production migration, destructive database actions, secrets, and production deployment promotion behind human control.

Initial operational targets after 20-30 representative tasks:

- >= 70% of low-risk `agent-ready` tasks reach a green Draft PR without manual code edits.
- median repair iterations <= 2.
- no autonomous merge to `main`.
- no autonomous production migration or destructive production data operation.
- no completed task without verification evidence.
- same deterministic failure is retried at most twice after attempted fixes.
- CI consumption stays near <= 1.5x the human-driven baseline before autonomy is expanded.

These are calibration targets, not hard product guarantees.

## Approaches considered

### A. GitHub Actions-centric autonomous runner

GitHub Actions would receive issues, run the coding agent, edit code, verify, push, and repair CI.

Advantages:
- centralized and event-driven;
- no local daemon to operate;
- natural integration with PR events.

Disadvantages:
- broad permissions become dangerous when issue/PR text is untrusted;
- expensive long-running agent loops amplify CI usage;
- production-adjacent secrets and GitHub write capability can collapse trust boundaries;
- harder to sandbox interactive coding cleanly.

Decision: not selected as the initial execution plane.

### B. Dedicated agent service

A persistent service receives GitHub events, maintains durable task state, provisions sandboxes, routes models, and manages retries.

Advantages:
- highest observability and autonomy ceiling;
- durable state and model routing are straightforward;
- scales to many concurrent tasks.

Disadvantages:
- largest operational surface;
- requires credential management, queueing, sandbox lifecycle, persistence, telemetry, and service maintenance before the project has proven the loop economics.

Decision: defer until telemetry shows a need.

### C. Hybrid local/self-hosted runner + GitHub verification plane

A controlled agent runner owns isolated worktrees and local fast verification. GitHub remains the authoritative PR/CI/security plane. Human review remains the merge gate.

Advantages:
- smallest new control plane;
- leverages the strong CI already present;
- keeps model credentials and repository write capability away from production workflows;
- easy to introduce bounded state, token budgets, and worktree isolation incrementally.

Disadvantages:
- runner availability initially depends on the developer machine/self-hosted environment;
- durable event automation is less complete than a dedicated service.

Decision: **selected** for Phase 1-3. It provides the best reliability/security/complexity trade-off for the current repository.

## Target architecture

```text
GitHub Issue / explicit task
        |
        v
Task contract validation
        |
        v
Static risk classifier
        |
   +----+------------------+
   |                       |
 low/medium             high/critical
   |                       |
   v                       v
isolated branch        plan-only / human gate
+ worktree
   |
   v
bounded context inspection
   |
   v
implement smallest coherent change
   |
   v
fast deterministic verification
   | fail
   +------> diagnose evidence -> targeted repair
   |
 pass
   v
full verification
   |
   v
Draft PR
   |
   v
GitHub CI + security + review
   | fail
   +------> PR babysitter classifies
              | branch-caused -> fix same branch
              | flaky -> bounded rerun
              | infra/ambiguous/protected -> escalate
   |
 green
   v
human review + merge
   |
   v
existing production/deployment workflows
```

GitHub Actions is the verification plane, not the autonomous model execution plane.

## Loop boundaries

### Inner code loop

Input:
- goal;
- acceptance criteria;
- non-goals;
- risk hint;
- verification requirements.

Process:
1. inspect only relevant code/config/tests;
2. plan the smallest coherent change;
3. implement;
4. run fast targeted verification;
5. fingerprint failures;
6. repair only when evidence is actionable;
7. run full verification before Draft PR.

Default maximum implementation iterations: 5.
Same deterministic failure after 2 attempted fixes: escalate.

### PR babysitter loop

Trigger: Draft PR has CI/review changes.

The babysitter may:
- inspect CI/review evidence;
- classify failures;
- modify only the PR branch for branch-caused defects;
- re-run local verification;
- push a repair commit;
- retry likely-flaky CI within budget.

It must not:
- merge the PR;
- edit product code to compensate for infrastructure outages;
- weaken tests/lint/typecheck/security checks;
- modify protected areas without an approved high-risk execution session.

Default flaky retry budget: 3.

### Project loop

Later, an issue labeled `agent-ready` may dispatch a low/medium-risk task to the runner after schema validation. This is Phase 3 and must not be enabled before Phase 1-2 telemetry is stable.

### Post-merge loop

Initial behavior is detection-only:
- observe deployment status;
- run safe smoke/E2E checks when a suitable isolated target exists;
- collect evidence;
- create/escalate a repair task if regression is detected.

No autonomous production DB mutation, arbitrary rollback, or self-healing data writes.

## Risk model

Risk starts with deterministic path/action rules. A model may add semantic risk but may not downgrade a deterministic classification.

### Low

Examples:
- docs;
- copy;
- isolated styling/component changes;
- focused test additions;
- harmless refactors.

Autonomy:
implement -> verify -> Draft PR.

### Medium

Examples:
- non-sensitive API/business logic;
- normal repository queries;
- React state/data-flow changes.

Autonomy:
implement -> full verify -> Draft PR -> human review.

### High

Examples:
- auth/authorization/ownership;
- CSRF/CORS/security middleware;
- payment/checkout/inventory writes;
- schema/migrations/seed/reset;
- GitHub workflow or deployment config.

Autonomy:
read/analyse/plan automatically; explicit human approval required before writes.

### Critical

Examples:
- production credentials;
- destructive production DB actions;
- disabling security checks;
- bypassing branch protection;
- privilege escalation.

Autonomy:
no execution.

## Protected areas

Initial hard-stop paths:

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
**/.env*
```

Initial review-required paths:

```text
server/src/auth/**
server/src/checkout/**
server/src/orders/**
server/src/inventory/**
server/src/**/*.repository.ts
client/src/**/auth/**
client/src/services/**
```

Path rules are starting guardrails. They should be calibrated from actual task telemetry.

## Verification design

Do not introduce Jest. Keep Vitest.

Do not create a root pnpm workspace. The root orchestration layer, if needed, must not become a dependency-resolution workspace or replace package-local lockfiles.

### Fast verification

Fast verification is change-aware and used during repair iterations.

Client candidates:
- TypeScript no-emit;
- ESLint;
- targeted Vitest.

Server candidates:
- TypeScript no-emit;
- ESLint;
- targeted Vitest;
- `prisma:validate` when database-related code/config is implicated.

Fast mode is an optimization only; it is never the final merge gate.

### Full verification

Before a Draft PR is handed off as ready:

Client:
- typecheck;
- lint;
- full Vitest;
- build;
- existing preview smoke where CI provides it.

Server:
- Prisma validation where applicable;
- typecheck;
- lint;
- full Vitest;
- integration tests in disposable MySQL;
- build;
- existing health smoke.

GitHub remains authoritative for:
- CI client/server jobs;
- dependency review;
- CodeQL default setup;
- production-adjacent checks.

k6 stays outside the inner loop by default and remains read-only unless an isolated database target is explicitly available.

Playwright is a Phase 2 extension, not a Phase 1 prerequisite. It should be introduced only for deterministic core browser journeys and should not run against production customer/payment data.

## State model

Loop state must not depend on chat history. Persist a compact machine-readable state file locally, gitignored.

Proposed path:

```text
.loop/state/<task-id>.json
```

Minimum fields:

```json
{
  "schemaVersion": 1,
  "taskId": "github-issue-241",
  "branch": "feature/example",
  "baseSha": "...",
  "headSha": "...",
  "phase": "repair",
  "risk": "medium",
  "iteration": 2,
  "maxIterations": 5,
  "ciRetryCount": 0,
  "acceptanceCriteria": [],
  "lastVerification": {
    "command": "...",
    "exitCode": 1,
    "failedCheck": "...",
    "failureFingerprint": "..."
  },
  "failureCounts": {},
  "protectedPathsTouched": [],
  "budgets": {
    "tokenLimit": null,
    "tokenUsed": null,
    "wallClockLimitSeconds": null,
    "ciRunLimit": null
  },
  "escalationReason": null,
  "updatedAt": "..."
}
```

Never commit raw prompt history, credentials, production payloads, cookies, tokens, or user data.

## Budget model

Budget is a first-class stop condition.

The initial implementation must support configuration for:
- max implementation iterations;
- max same-failure count;
- max flaky CI retries;
- max wall-clock duration;
- optional token limit/usage fields;
- optional CI-run limit.

Recommended starting defaults:
- max implementation iterations: 5;
- same failure after attempted fix: 2;
- flaky retries: 3;
- unexpectedly broad diff: pause/re-plan around 25 files or 1,000 changed LOC.

Token numbers must remain configurable until real model telemetry is available; do not hard-code vendor-specific prices.

## Failure classification

A PR/verification failure must be classified before repair:

- `branch-caused`: product/config/test defect introduced by the branch; repair allowed within risk boundaries.
- `flaky`: nondeterministic test/runner behavior; retry within budget and collect evidence.
- `infrastructure`: GitHub/Vercel/network/third-party issue; do not mutate product code.
- `protected`: repair requires a high-risk path/action; escalate.
- `ambiguous`: evidence is insufficient; escalate rather than guess.

## Security model

All issue bodies, PR descriptions, comments, commit messages, uploaded fixtures, and external webpage content are untrusted inputs.

The runner may receive:
- repository read access;
- write access only to its own worktree/branch;
- allowlisted local verification commands;
- permission to create/update a Draft PR in later phases.

The runner must not receive:
- production database credentials;
- GitHub secrets administration;
- branch protection bypass;
- direct `main` push;
- production migration execution;
- destructive production reset capability;
- Vercel production promotion credentials.

Untrusted text must never be interpolated directly into shell commands.

## Repository layout

Phase 1 should introduce a small control-plane surface without restructuring product code:

```text
digital-e-shop/
├── AGENTS.md
├── scripts/
│   └── loop/
│       ├── verify.mjs
│       ├── classify-risk.mjs
│       ├── fingerprint-failure.mjs
│       └── state.mjs
├── .agent/
│   ├── policy/
│   │   ├── protected-paths.yml
│   │   ├── risk-rules.yml
│   │   └── stop-conditions.yml
│   └── loops/
│       ├── feature.md
│       └── pr-babysitter.md
├── .loop/
│   └── state/              # gitignored
├── .github/
│   └── ISSUE_TEMPLATE/
│       └── agent-task.yml
└── docs/
    └── superpowers/
        ├── specs/
        └── plans/
```

A root `package.json` is not required for Phase 1. Prefer direct `node scripts/loop/*.mjs` entry points so the repository remains two independent pnpm package roots. If a root automation manifest later proves useful, it must be automation-only and must not recreate a workspace.

## Phase rollout

### Phase 1 - deterministic inner loop foundation

Deliver:
- Loop Contract added to `AGENTS.md`;
- policy YAML files;
- state schema/helper;
- risk classifier;
- failure fingerprinting;
- fast/full verification router;
- task issue template;
- gitignore for local loop state;
- tests for classifier/state/verification routing.

No autonomous GitHub write execution is required for Phase 1.

### Phase 2 - PR babysitter

Deliver:
- PR state machine documentation and runner integration;
- CI failure classification;
- bounded flaky retry;
- branch-owned repair workflow;
- escalation packet;
- optional Playwright foundation for core UI smoke journeys after existing CI stays stable.

No auto-merge.

### Phase 3 - issue to Draft PR

Deliver:
- `agent-ready` issue validation;
- one task -> one branch -> one worktree;
- local/self-hosted runner;
- bounded context loading;
- Draft PR creation;
- durable telemetry for iterations, verification, CI, token usage when available, and human interventions.

### Phase 4 - post-merge evidence loop

Deliver:
- deployment status observation;
- smoke/E2E on safe targets;
- regression task generation;
- scheduled/read-only performance evidence;
- periodic human review of loop telemetry and policies.

No autonomous production mutation.

## Error and escalation contract

Every terminal failure should produce a compact escalation packet containing:
- task and risk;
- iteration/budget status;
- goal and acceptance criteria;
- exact checks that passed/failed;
- failure fingerprint;
- previous repair attempts;
- protected areas implicated;
- why automation stopped;
- concrete human choices.

The phrase "agent failed" is not an acceptable escalation artifact.

## Testing strategy

The Loop Engineering control-plane code is itself production code and requires tests.

At minimum:
- risk classifier tests for low/medium/high/critical paths;
- precedence test proving deterministic high/critical rules cannot be downgraded;
- state serialization/deserialization tests;
- repeated-failure counter tests;
- verification routing tests for client-only, server-only, DB-related, and mixed changes;
- command allowlist tests;
- diff-budget stop-condition tests;
- failure-classification tests;
- integration smoke using a temporary fixture repository or mocked command runner.

The control plane must not use real production credentials in tests.

## Non-goals

This foundation does not:
- auto-merge PRs;
- run production migrations autonomously;
- mutate production data autonomously;
- replace GitHub Actions;
- replace CodeQL;
- replace Vitest with Jest;
- convert the repository into a pnpm workspace;
- migrate MySQL to PostgreSQL;
- introduce a multi-tenant agent platform;
- allow agents to self-modify safety policy and immediately run under the new policy.

## Definition of done for the foundation

The foundation is complete when:
- a low-risk fixture task can traverse inspect -> implement -> verify -> done under bounded iteration/state rules;
- a repeated deterministic failure escalates instead of looping forever;
- a protected-path fixture stops before write;
- verification evidence is machine-readable and human-readable;
- client-only and server-only changes route to the expected checks;
- full verification reuses the repository's existing package commands and CI semantics;
- local state is excluded from git;
- documentation states exact autonomy boundaries;
- no agent path can merge to `main` or trigger production migration directly.

## Recommended execution mode after plan approval

For implementation, prefer **subagent-driven development** because the work naturally separates into policy/state, verification routing, tests, documentation, and PR-loop integration, and because a defect in the control plane can amplify future agent mistakes. Use one writer per task/worktree and a fresh reviewer between tasks.
