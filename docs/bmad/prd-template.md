# PRD — <feature name>

Keep it short. Delete sections that don't apply. For small work, a few bullets per section is enough.

## Problem

What user/operator problem are we solving, and why now?

## Goal & success criteria

- What does success look like (measurable where possible)?

## Scope

**In scope:**
- …

**Out of scope:**
- …

## Users / personas

Who is affected (customer, admin)?

## User stories

- As a <role>, I want <capability> so that <benefit>.

## Acceptance criteria

- [ ] …
- [ ] …

## Affected surface

- Frontend modules: `client/src/features/<domain>/…`
- Backend modules: `server/src/modules/<feature>/…`
- Database tables / Prisma: …
- API contracts touched (preserve unless explicitly changing): …

## Risks & constraints

- Performance-sensitive paths? Auth/CSRF/ownership impact? Schema migration?

## Verification

Which commands and manual checks confirm this works (see [AGENTS.md](../../AGENTS.md) → Verification commands).

## Wiki updates needed

Which `Wiki/` pages must change on completion?
