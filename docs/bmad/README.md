# BMAD Lightweight Workflow

A minimal product-and-engineering process for Digital-E. Keep it light: a solo dev or small team should never drown in process. Roles are **hats one person (or one AI agent) wears**, not separate people. Produce only the artifacts a task actually needs.

See also: [AGENTS.md](../../AGENTS.md) → "BMAD lightweight workflow" and "Superpowers execution workflow", and [CLAUDE.md](../../CLAUDE.md).

## When to use BMAD

Use it for non-trivial work:

- Multi-file features.
- Database schema or API contract changes.
- Anything touching checkout, auth/CSRF, inventory, or admin authorization.
- Work spanning more than ~a day or with unclear requirements.

## When NOT to use BMAD

Skip it — just run the Superpowers steps — for:

- Typo / copy / styling tweaks.
- Single-function bug fixes.
- Dependency bumps.
- Documentation edits.

## Roles and responsibilities

| Role | Responsibility | Artifact (if any) |
| --- | --- | --- |
| **Analyst** | Clarify the problem, constraints, success criteria. | Notes in [product-brief.md](./product-brief.md) |
| **PM** | Define scope, user value, acceptance criteria. | PRD from [prd-template.md](./prd-template.md) |
| **Architect** | Decide where it fits the existing structure; record non-obvious choices. | Decision in [Wiki/decisions/](../../Wiki/decisions/) + [architecture-template.md](./architecture-template.md) if substantial |
| **Scrum Master** | Slice the PRD into small, shippable stories. | Stories from [story-template.md](./story-template.md) |
| **Developer** | Implement via the Superpowers workflow; keep changes small. | Code + tests |
| **QA** | Verify against acceptance criteria and the checklist. | [qa-checklist.md](./qa-checklist.md) pass |

## Workflow: idea → implementation

1. **Analyst** — restate the problem and constraints; confirm the goal is worth doing.
2. **PM** — write a short PRD (scope, value, acceptance criteria). For small work, a few bullets suffice.
3. **Architect** — locate it in the existing module structure; if a choice is non-obvious, add a one-file ADR in `Wiki/decisions/`. Read `Wiki/architecture.md` first.
4. **Scrum Master** — break the PRD into small stories, each independently verifiable.
5. **Developer** — implement each story with the Superpowers loop: inspect → clarify → plan → implement → test → review → summarize.
6. **QA** — run `qa-checklist.md` plus the verification commands; confirm acceptance criteria.
7. **Wiki** — update `Wiki/` for any architecture / API / schema / business-logic change; append to `Wiki/log.md`.

## How Claude Code applies this

- Default to the Superpowers loop for everything. Layer BMAD on **only** when the task meets the "when to use" bar above.
- Wear the roles in sequence within a single session; don't spawn process for its own sake.
- Prefer a handful of bullets over filling every template field. Templates are checklists, not forms that must be completed.
- Always finish with verification commands and a summary of changed files + risks.
