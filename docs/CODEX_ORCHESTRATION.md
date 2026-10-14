# Codex orchestration

The user is the Product Owner and describes outcomes in natural language.
Main Codex owns analysis, planning, specialist selection, integration,
validation, review, and delivery. Work starts on demand in the active session.

## Repository configuration

```text
.codex/
  config.toml
  agents/
    architect.toml
    backend.toml
    frontend.toml
    qa.toml
    reviewer.toml
    devops.toml
```

`config.toml` enables agents and limits concurrent subagents to two, excluding
Main Codex. All six specialists use `gpt-6-luna` with medium reasoning,
preserving the repository's Luna delegation policy. The session default also
uses Luna so a generic delegated task has the same default.

Custom TOML files are discovered from `.codex/agents/`. Each defines `name`,
`description`, and `developer_instructions`; its filename matches its name.
The project must be trusted for project configuration to load. Start a new
Codex session after changing configuration.

Agents inherit the parent session's permissions and tools. File ownership and
read-only role instructions are coordination rules, not an OS permission
boundary. Managed approval requirements still apply.

See the official [subagents guide](https://learn.chatgpt.com/docs/agent-configuration/subagents)
and [configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference).
These files configure native Codex agents; no separate orchestration service
or application runtime is needed.

## Choose only the roles needed

| Role | Use for | Default ownership |
| --- | --- | --- |
| Main Codex | Scope, integration, validation, Git, final report | Shared files and final decisions |
| Architect | Module boundaries, contracts, schema design, complex flow design | Investigation/design; assigned docs only |
| Backend | API, persistence, business logic | Exact assigned server paths |
| Frontend | React, UI/UX, client state and API integration | Exact assigned client paths |
| QA | Tests, browser evidence, failure classification | Verification; assigned test files only |
| Reviewer | Correctness, security, regression and quality review | Read-only diff review |
| DevOps | CI/CD or deployment configuration and operational plans | Read-only unless exact config edits are approved |

For a small UI fix, Main Codex can act directly or use one Frontend agent.
A checkout feature may need Architect first, Backend and Frontend for independent
implementation slices, then QA and Reviewer after integration. Six available
roles do not imply six agents per task.

Delegate when independent ownership, specialist investigation, or independent
review provides a concrete benefit. Keep local work in Main Codex when the
overhead exceeds the task or the next step depends on one answer.

Before spawning, inspect existing agents and reuse a suitable agent. Keep no
more than two subagents concurrently active. Wait for dependent tasks before
starting their consumers. Specialists must return to Main Codex and must not
spawn more agents.

Reuse follow-up tasks for fixes. Respect the host lifecycle: release completed
agents when supported, or allow automatic eviction. Never exceed the session
limit. Limit unnecessary context and repeated scans. Concurrency caps simultaneous
usage; they do not cap total tokens or cost.

If the host exposes named agent selection, use the corresponding custom role.
If it only offers generic spawning, provide the role's instructions in a bounded
task packet and explicitly select the allowed Luna model and reasoning effort.
If Luna or subagent tools are unavailable, report that limitation and let Main
Codex handle the work; do not silently substitute a delegated model.

## Handoff and file ownership

Read `AGENTS.md`, `docs/ai-prompts/README.md`, and `Wiki/index.md` first.
Choose the closest task prompt for each packet.

Every delegated task must specify:

- Role and goal with observable acceptance criteria.
- Exact owned paths and hard exclusions.
- Whether edits are allowed and any required exact-scope approval.
- Inputs, dependencies, and relevant compatibility/security constraints.
- Verification expectations and the report contract below.

Give agents only necessary context. Never assign overlapping write ownership.
Main Codex owns shared contract files and integrates changes when two slices
need the same file. Reviewers inspect an integrated diff; they do not edit it.
Agents report scope conflicts before making changes.

```text
Role: frontend
Goal: Implement the approved wishlist UI acceptance criteria.
Owned paths: exact client feature files assigned by Main Codex.
Exclusions: server files, auth infrastructure, shared contract files, Git operations.
Edits: allowed within owned paths only.
Dependencies: agreed backend API contract.
Verification: relevant client checks and available browser evidence.
Return: the report contract below.
```

## Delivery and validation

1. Inspect the repository and classify paths/actions before writing.
2. Define scope, acceptance criteria, assumptions, and file ownership.
3. Implement directly or delegate only the useful bounded slices.
4. Integrate reports and inspect the actual diff. Fix relevant findings.
5. Run the checks for the changed surface from `AGENTS.md`. Use isolated data
   for integration tests. Configuration/documentation-only work needs no app build.
6. Review correctness, security, accidental scope changes, and verification.
7. Commit the task changes on a feature/bugfix/hotfix branch after validation.
   Create or update a PR only when requested. Report changed files, behavior,
   commands/results, assumptions, and remaining risks.

Main Codex owns commits and remote actions. Never push directly to `main`.
Merging requires explicit authorization, passing required quality gates, and
at least one human review. Deployment requires explicit permission and existing
environment gates. Protected paths and actions retain the repository's approval
requirements.

This workflow runs only when requested. Background monitoring, cron, unattended
dispatchers, workers, and queues are outside this orchestration setup.

## Report contract

Return a concise report; use `none` for an empty field:

```text
Status: pass | findings | blocked
Role: role_name
Files changed: none | path list
Findings:
- [P0|P1|P2|P3] path:line: evidence and impact
Verification:
- exact command or browser route, viewport, locale, theme, and result
Assumptions:
- assumption or none
Risks:
- remaining risk or none
Next action:
- concrete next action or none
```

Main Codex verifies agent claims against the diff and command results, then
summarizes the integrated result without pasting long logs.
