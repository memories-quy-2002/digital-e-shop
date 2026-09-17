# Architecture note for your_feature_name

Use this note for a change that affects module boundaries, data ownership,
contracts, or cross-package behavior. For one decision, prefer a single ADR in
[Wiki/decisions/](../../Wiki/decisions/).

Goal: explain how **your_feature_name** fits the current architecture.

Audience: maintainers, developers, reviewers, and QA.

Content plan: context, decision, boundaries, flow, contracts, UX, alternatives,
risks, verification, and durable documentation.

Open questions: **your_architecture_questions_or_none**

## Context

What is changing, why is it needed, and which PRD or Wiki pages describe it?

## Decision

State the chosen approach and the invariant it preserves.

## Components and boundaries

- Client: features, pages, components, styles, contexts, and API wrappers
- Server: Nest module, controller, service, repository, validator, guards,
  pipes, middleware, and shared types
- Data: MySQL tables and queries, plus any partial Prisma schema or migration
- External systems: Firebase, PayOS, Vercel services, or none

Keep `client/` and `server/` independent. Keep SQL in repositories and
business orchestration in services.

## Data flow

Describe the request path:

`request -> middleware or guard -> validation -> service -> repository -> response`

Include auth, CSRF, ownership, transactions, idempotency, inventory, payment,
notification, and audit checkpoints that apply.

## Contracts

Document request and response keys, route aliases, cookies, CSRF behavior,
error shapes, and compatibility constraints. Preserve existing contracts unless
the PRD explicitly approves a change.

For payment work, document provider, currency, amount precision, webhook
verification, duplicate-event behavior, reconciliation, and manual recovery.

## UX and interaction boundary

Describe the primary action, loading, empty, validation, error, recovery,
responsive, i18n, theme, focus, contrast, and reduced-motion behavior. Record
the browser route and viewports needed for verification.

## Alternatives considered

- **your_alternative**: rejected because **your_reason**

## Risks and mitigations

- Security and ownership: **your_risk_and_mitigation**
- Data and migration: **your_risk_and_mitigation**
- Performance and operability: **your_risk_and_mitigation**

## Verification

List exact package-local checks, focused tests, API smoke checks, and browser
checks. Record unavailable environment dependencies instead of assuming success.

## Durable documentation

Update **your_wiki_page_or_adr** with **your_durable_decision_or_fact**.
