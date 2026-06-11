# Architecture Note — <feature name>

Use only when a change is architecturally non-trivial. For a single decision, prefer a one-file ADR in [Wiki/decisions/](../../Wiki/decisions/) instead.

## Context

What is changing and why. Link the PRD and relevant [[architecture]] / [[overview]] wiki pages.

## Approach

How it fits the existing structure (`modules/<feature>` layering, feature folders, shared types). Prefer reusing existing patterns over new abstractions.

## Components & boundaries

- Frontend: which features/pages/components/api wrappers.
- Backend: which routes → controller → service → repository, validators, shared types.
- Data: tables, queries, Prisma schema touches.

## Data flow

Request → validation → service orchestration → repository → response shape. Note auth/CSRF/ownership checkpoints.

## Contracts

API request/response shapes (preserve existing keys unless explicitly changing). Cookie/CSRF/route-alias impact.

## Alternatives considered

Briefly, and why rejected.

## Risks & mitigations

Performance paths, migration safety, multi-table coordination (checkout/inventory/timeline/notifications).

## Decision

Summary. If durable, copy into a `Wiki/decisions/NNNN-*.md` ADR and link here.
