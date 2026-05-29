# Codex Sub-Agent Orchestration

This file defines the default multi-agent working pattern for Codex tasks in this repository.

Use it when a task is broad enough to benefit from parallel review, isolated implementation, or independent verification. For small tasks, use one primary agent only.

## Core Pattern

Use a 4-agent orchestrator-worker pattern:

1. Main Agent
   - Owns the user request, planning, file ownership, final decisions, integration, and final response.
   - Reads `AGENTS.md` first.
   - Reads this file before delegating work.
   - Keeps public APIs stable unless the user explicitly asks for behavior changes.
   - Receives short reports from sub-agents and integrates only the useful findings.

2. Backend Agent
   - Owns backend-only investigation or implementation.
   - Scope: `server/src/routes`, `server/src/controllers`, `server/src/services`, `server/src/models`, `server/src/middlewares`, `server/src/validation`, `server/src/types`.
   - Focus: auth, CSRF, ownership checks, request validation, SQL boundaries, error handling, TypeScript types, and route contracts.
   - Must not edit client files.

3. Frontend Agent
   - Owns frontend-only investigation or implementation.
   - Scope: `client/src/api`, `client/src/components`, `client/src/context`, `client/src/routes`, `client/src/styles`, `client/src/utils`.
   - Focus: React behavior, loading/empty/error states, mobile layout, SCSS maintainability, accessibility basics, and API helper reuse.
   - Must not edit server files.

4. Verification Agent
   - Owns targeted checks that can run independently.
   - Scope: typecheck, build, lint, read-only k6 scripts, route smoke checks, and focused regression review.
   - Must not run write-heavy performance tests against shared data.
   - Must report exact commands, pass/fail status, and environment limitations.

## When To Use Sub-Agents

Use sub-agents when at least one condition is true:

- The task touches clearly separate backend and frontend areas.
- The task needs independent review after implementation.
- The task has multiple unrelated questions that can be answered in parallel.
- The task risks context overload in a single conversation.
- The user explicitly asks for sub-agents, delegation, or orchestration.

Do not use sub-agents when:

- The task is small and local to one file.
- The next step is blocked on one answer that the main agent can inspect faster.
- Multiple agents would need to edit the same files.
- The overhead would be larger than the work.

## Handoff Rules

Sub-agent handoffs must be explicit and bounded.

Each delegated task must include:

- Role name.
- Goal.
- File or module ownership.
- Hard exclusions.
- Required output format.
- Whether edits are allowed.
- Verification expectations.

The main agent should give sub-agents only the context needed for the task. Prefer short task packets over full history unless exact context is required.

## Report Contract

Sub-agents return short reports only:

```text
Status: completed | blocked | no findings
Files changed: path list, or "none"
Findings: concise bullets with file/line when relevant
Verification: commands run and result
Risks: remaining assumptions or follow-up needed
```

The main agent should not paste long sub-agent logs into the final answer. Summarize the integrated result.

## File Ownership

Avoid concurrent edits to the same files.

Recommended split:

- Backend Agent: server files only.
- Frontend Agent: client files only.
- Verification Agent: no edits unless explicitly assigned test/config files.
- Main Agent: integration, conflict resolution, docs, final cleanup.

If two agents need the same file, the main agent keeps ownership and delegates read-only review instead.

## Default Task Packets

### Backend Agent

```text
Read AGENTS.md and docs/CODEX_ORCHESTRATION.md.

Role: Backend Agent.
Goal: Investigate or implement only the backend slice of this task.
Scope: server files only.
Do not edit client files.
Preserve auth, CSRF, ownership checks, route contracts, and database schema.
Keep controllers thin and SQL inside models.

Return:
- Status
- Files changed
- Key findings or implementation summary
- Verification run
- Remaining risks
```

### Frontend Agent

```text
Read AGENTS.md and docs/CODEX_ORCHESTRATION.md.

Role: Frontend Agent.
Goal: Investigate or implement only the frontend slice of this task.
Scope: client files only.
Do not edit server files.
Use existing API helpers, context providers, React Router patterns, and SCSS structure.
Preserve cookie and CSRF request behavior.

Return:
- Status
- Files changed
- Key findings or implementation summary
- Verification run
- Remaining risks
```

### Verification Agent

```text
Read AGENTS.md and docs/CODEX_ORCHESTRATION.md.

Role: Verification Agent.
Goal: Verify the current changes with targeted checks.
Do not make product code edits unless explicitly assigned.
Do not run write-heavy tests against real or shared data.

Prefer relevant commands:
- pnpm --filter client build
- pnpm --filter server typecheck
- pnpm --filter server build
- pnpm --filter server lint
- server read-only k6 scripts only when requested

Return:
- Status
- Commands run
- Pass/fail result
- Important output
- Environment limitations
```

## Practical Defaults For This Repo

For normal feature work:

1. Main Agent inspects relevant files and defines file ownership.
2. Main Agent edits the critical path locally.
3. Sub-agents are used only for independent backend, frontend, or verification slices.
4. Main Agent reviews reports and integrates findings.
5. Main Agent runs final targeted verification.
6. Main Agent summarizes changed files, behavior, verification, and risks.

For broad full-stack tasks:

1. Backend Agent handles backend API/service/model validation.
2. Frontend Agent handles UI/API integration.
3. Verification Agent runs checks after the main integration step.
4. Main Agent owns final merge decisions and prevents conflicting edits.

## Notes On Standards

This pattern follows two common agent orchestration ideas:

- Handoff pattern: a coordinator routes bounded work to specialized agents and defines what context they receive.
- Orchestrator-worker pattern: a lead agent decomposes the work, delegates independent slices, and composes the final result.

In this repository, prefer controlled delegation over autonomous handoffs. The main agent remains accountable for correctness, reviewability, and final verification.
