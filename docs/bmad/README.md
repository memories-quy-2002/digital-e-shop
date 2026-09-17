# BMAD workflow for Digital-E

BMAD is a lightweight planning loop for work that can affect product behavior,
data, contracts, or multiple packages. Treat the roles as hats worn by one
maintainer or one AI agent. Produce only the artifacts the task needs.

Goal: make non-trivial work explicit before implementation and verifiable after
implementation.

Audience: the maintainer, product engineers, reviewers, and delegated agents.

Content plan: when to use BMAD, roles, artifacts, quality gates, delegation,
and the current Digital-E repository shape.

Open questions: none. Record unresolved product choices in a PRD or a Wiki ADR.

See [AGENTS.md](../../AGENTS.md) for the authoritative Superpowers workflow and
the [Codex orchestration guide](../CODEX_ORCHESTRATION.md) for delegation.

## When to use BMAD

Use BMAD for:

- Multi-file features or work that crosses client and server
- Database schema, API contract, checkout, payment, or webhook changes
- Auth, CSRF, inventory, ownership, or admin authorization changes
- Work that spans more than one day or has unresolved product scope
- A visual redesign that changes shared layout, theme, navigation, or content

Skip BMAD for:

- A copy or documentation edit
- A single-function bug fix with a known root cause
- A narrow styling correction
- A dependency bump with no architecture impact

The Superpowers loop still applies to every change. BMAD adds planning when the
change needs product, architecture, or delivery coordination.

## Roles and artifacts

| Role | Responsibility | Artifact |
| --- | --- | --- |
| Analyst | Clarify the problem, audience, constraints, and success criteria | Notes in the task or [product-brief.md](./product-brief.md) |
| PM | Define value, scope, stories, and acceptance criteria | [prd-template.md](./prd-template.md) |
| Architect | Place the change in the current boundaries and record non-obvious choices | [architecture-template.md](./architecture-template.md) or one Wiki ADR |
| Scrum Master | Slice work into independently verifiable units | [story-template.md](./story-template.md) |
| Developer | Implement the approved scope with tests and package-local checks | Code and tests |
| QA | Verify behavior, UI, security, contracts, and risks | [qa-checklist.md](./qa-checklist.md) |

Do not fill every template field by habit. Delete sections that do not affect
the decision.

## Workflow from idea to delivery

1. Analyst: state the user problem, audience, constraints, and desired outcome
2. PM: write a short PRD with scope and acceptance criteria
3. Architect: inspect [Wiki/architecture.md](../../Wiki/architecture.md) and
   document boundary or data decisions
4. Scrum Master: split the PRD into small stories with independent evidence
5. Developer: inspect, clarify, plan, implement, test, review, and summarize
6. QA: run the checklist and the relevant package-local checks
7. Wiki: update durable architecture, API, schema, or business-rule knowledge

Keep completed plans under [docs/superpowers/](../superpowers/) as historical
records. Update maintained guides and Wiki pages when current behavior changes.

## Quality gates for Digital-E

### Product and copy

- Explain the user benefit with concrete, supportable claims
- Use active voice, sentence case, precise labels, and clear next actions
- Keep public contact details and business figures as placeholders until the
  maintainer explicitly provides real values

### Visual UI and UX

- Keep English and Vietnamese translations complete and semantically aligned
- Verify light and dark themes with the existing theme tokens
- Check desktop and mobile layout, overflow, hierarchy, focus, contrast, touch
  targets, loading, empty, error, and recovery states
- Use `frontend-design`, `ui-ux-pro-max`, and
  `web-design-guidelines` for review guidance
- Use `playwright` for rendered browser evidence when UI changes

### Logic, data, and security

- Keep validation before persistence and server-authoritative totals
- Preserve auth, CSRF, roles, ownership, rate limits, idempotency, and safe logs
- For PayOS and COD, keep exact whole-number VND, verified webhook finalization,
  duplicate-event protection, and guarded COD confirmation
- Treat the seven-calendar-day return rule as a requirement. Confirm runtime
  enforcement before claiming that the feature is complete
- Keep guest data token-protected and limited to guest-safe fields

### Architecture

- Keep client and server as independent pnpm packages
- Keep client domain code in features and shared requests in the HTTP layer
- Keep Nest controllers thin, services orchestration-focused, repositories
  SQL-focused, and validators responsible for write input
- Keep MySQL as the primary runtime persistence path and Prisma partial
- Prefer the smallest existing abstraction that fits the boundary

## Delegation and repository tooling

Use [CODEX_ORCHESTRATION.md](../CODEX_ORCHESTRATION.md) only when independent
work justifies delegation. Use only the Luna model for delegated sub-agents.
The primary agent owns scope, integration, security decisions, and final
verification. Never assign overlapping write ownership.

This repository does not require a `.codex` folder. Keep agent rules in
[AGENTS.md](../../AGENTS.md), reusable prompts in [docs/ai-prompts/](../ai-prompts/),
orchestration in [CODEX_ORCHESTRATION.md](../CODEX_ORCHESTRATION.md), and
durable understanding in [Wiki](../../Wiki/index.md).

## Current repository shape

- `client/` is an independent React 19, Vite, TypeScript, Tailwind, Radix,
  and SCSS package
- `server/` is an independent NestJS 11 API on Express 5
- MySQL is the primary runtime database. Prisma 7 owns a partial forward-
  migration layer
- PayOS and COD are the active payment choices for new VND checkout
- Current support tickets are authenticated. Dedicated returns, warranty,
  refunds, and guest after-sales requests require an explicit implementation
- Use [docs/TESTING.md](../TESTING.md) and [AGENTS.md](../../AGENTS.md) for
  current commands. Do not copy historical commands from completed plans
