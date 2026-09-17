# Story for your_short_title

A small, independently shippable and verifiable unit of work.

Goal: deliver **your_story_outcome** without hiding unrelated scope.

Audience: the developer and QA owner.

Content plan: story, acceptance, context, affected files, verification, and
definition of done.

Open questions: **your_story_question_or_none**

## Story

As a **your_role**, I want **your_capability** so that **your_benefit**.

## Acceptance criteria

- [ ] **your_observable_criterion**
- [ ] Loading, empty, error, permission, and recovery states are covered when
  relevant
- [ ] English and Vietnamese translations and light and dark themes are aligned
  when the story changes UI
- [ ] API, auth, CSRF, ownership, idempotency, and data rules are preserved or
  explicitly changed

## Notes and context

Links to the PRD, relevant source files, API routes, and Wiki pages. Record
known gotchas and assumptions.

## Affected files planned

- `client/src/features/your_domain/` or `client/src/pages/`
- `server/src/your_feature/`
- Tests, styles, docs, or migrations: **your_paths_or_none**

## Verification plan

- Package-local commands: **your_commands**
- Browser route, viewport, locale, theme, and expected result:
  **your_browser_checks_or_none**
- Database or external dependency: **your_isolated_environment_or_none**

## Definition of done

- [ ] Implemented with the smallest safe change
- [ ] Acceptance criteria met
- [ ] Relevant typecheck, test, build, and lint commands run
- [ ] Browser evidence recorded for changed UI when available
- [ ] API contracts, auth, CSRF, ownership, and data integrity preserved or
  explicitly approved
- [ ] Tests added where practical
- [ ] Wiki updated when architecture, API, schema, or business logic changed
- [ ] Summary written with files, behavior, verification, assumptions, and risks
