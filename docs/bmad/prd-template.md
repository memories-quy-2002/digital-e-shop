# PRD for your_feature_name

Content type: Reference

Goal: define the product scope and acceptance criteria for
**your_feature_name**.

Audience: maintainers, product engineers, reviewers, and QA.

Content plan: problem, outcome, users, scope, acceptance, affected surfaces,
risks, verification, and Wiki updates.

Open questions: **your_unresolved_product_questions_or_none**

## Problem

What problem does **your_feature_name** solve, for whom, and why now?

## Goal and success criteria

- User or operator outcome: **your_outcome**
- Measurable success signal: **your_success_signal**
- Explicit non-goal: **your_non_goal**

## Scope

In scope:

- **your_in_scope_item**

Out of scope:

- **your_out_of_scope_item**

## Users and stories

- As a **your_role**, I want **your_capability** so that **your_benefit**

## Acceptance criteria

- [ ] **your_behavior_criterion**
- [ ] Loading, empty, validation, permission, and failure states are defined
- [ ] English and Vietnamese copy, light and dark themes, and responsive states
  are defined when the feature has UI
- [ ] Security, ownership, idempotency, and audit rules are explicit when
  relevant

## Affected surface

- Client: `client/src/features/your_domain/`,
  `client/src/pages/`, or shared components and styles
- Server: `server/src/your_feature/` controller, service, repository,
  validator, guards, and shared types
- Data: tables, SQL, Prisma schema, and forward migrations
- Contracts: routes, request fields, response keys, cookies, CSRF, and aliases
- Documentation: [API guide](../API.md), [Wiki](../../Wiki/index.md), or
  decision records

## UX and content

- Primary action: **your_primary_action**
- Empty, error, loading, and recovery copy: **your_state_copy**
- Browser evidence: desktop and mobile route, locale, theme, and expected result
- Accessibility and responsive constraints: **your_constraints**

## Risks and constraints

- Auth, CSRF, role, ownership, PII, or secret handling: **your_security_risk**
- Data integrity, migration, payment, inventory, or concurrency risk:
  **your_data_risk**
- Performance or dependency risk: **your_performance_risk**

## Verification

List exact package-local commands and manual checks. Use [AGENTS.md](../../AGENTS.md)
for current commands. Use `playwright` for changed UI routes when available.

## Wiki updates needed

- Page or ADR: **your_wiki_page_or_none**
- Durable fact to record: **your_durable_fact_or_none**
