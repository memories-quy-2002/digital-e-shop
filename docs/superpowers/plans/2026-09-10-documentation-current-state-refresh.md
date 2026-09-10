# Documentation current-state refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align maintained Digital-E documentation with the current NestJS, React, database, authentication, checkout, CI, and package boundaries in the repository.

**Architecture:** Use the source tree, package scripts, environment templates, controllers, workflows, and current Wiki decisions as the evidence base. Refresh maintained documentation in coherent groups, preserve completed plans and specs as historical records, and run link plus stale-reference checks after editing.

**Tech Stack:** React 19, Vite 8, TypeScript, Tailwind CSS, Radix UI, SCSS, NestJS 11 on Express 5, MySQL, Prisma 7, Zod, Firebase, Stripe, Redis, Vitest, GitHub Actions, Vercel, and k6.

## Global Constraints

- Keep `client/` and `server/` independently installable with pnpm `12.3.4`.
- Use Node.js `24.20.0` from `.node-version`.
- Preserve current route contracts, cookie sessions, CSRF exclusions, ownership checks, role guards, and database safety boundaries.
- Describe MySQL as the primary runtime persistence layer and Prisma as a partial migration-owned layer.
- Do not invent maintainer contacts, production credentials, deployment status, test results, or unsupported product behavior.
- Do not rewrite completed plans, specs, generated reports, lockfiles, or source code.

---

### Task 1: Refresh root project and policy documents

**Files:**
- Modify: `README.md`
- Modify: `CODE_OF_CONDUCT.md`
- Modify: `CONTRIBUTING.md`
- Modify: `SECURITY.md`
- Modify: `CHANGELOG.md`
- Modify: `CLAUDE.md`
- Review factual sections in: `AGENTS.md`

- [x] Replace stale branch, package, architecture, testing, and setup details with current repository facts
- [x] Document the current local Docker database, demo seed safeguards, auth/payment boundaries, and independent package commands
- [x] Keep reporting and contribution guidance actionable without inventing contact information
- [x] Add current recent changes to the changelog and preserve older historical entries

### Task 2: Refresh maintained developer documentation

**Files:**
- Modify: `docs/README.md`
- Modify: `docs/API.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/DEVELOPMENT.md`
- Modify: `docs/TESTING.md`
- Modify: `docs/ci-cd.md`
- Modify: `server/README.prisma.md`
- Modify: `server/src/database/migrations/README.md`
- Modify: `server/test/README-k6.md`
- Modify: `docs/thunder-client/README.md`

- [x] Replace references to deleted Express route/model folders with the current Nest module and repository layout
- [x] Document current public, customer, admin, guest checkout, support, analytics, and webhook surfaces from controllers and config
- [x] Align commands with package-local scripts and distinguish unit, integration, build, migration, seed, and smoke checks
- [x] Keep destructive database and production migration instructions explicitly gated

### Task 3: Reconcile the Wiki with the current implementation

**Files:**
- Modify: `Wiki/index.md`
- Modify: `Wiki/overview.md`
- Modify: `Wiki/architecture.md`
- Modify: `Wiki/concepts/guest-checkout.md`
- Modify: `Wiki/concepts/order-lifecycle-and-support.md`
- Modify: `Wiki/decisions/0001-mysql-primary-prisma-partial.md`
- Modify: `Wiki/decisions/0002-nestjs-migration.md`
- Modify: `Wiki/decisions/0003-payment-ledger-and-usd-canonical-currency.md`
- Modify: `Wiki/decisions/0004-guest-cart-and-checkout.md`
- Append: `Wiki/log.md`

- [x] Use current source paths, module names, guards, route prefixes, and package versions
- [x] Keep historical ADR context while adding explicit current-state status where the implementation moved on
- [x] Preserve Obsidian wikilinks, update the index date, and append one maintenance-log entry

### Task 4: Refresh process templates and agent prompts

**Files:**
- Modify: `docs/bmad/README.md`
- Modify: `docs/bmad/product-brief.md`
- Modify: `docs/bmad/qa-checklist.md`
- Modify: `docs/bmad/architecture-template.md`
- Modify: `docs/bmad/prd-template.md`
- Modify: `docs/bmad/story-template.md`
- Modify: `docs/ai-prompts/feature.md`
- Modify: `docs/ai-prompts/bugfix.md`
- Modify: `docs/ai-prompts/refactor.md`
- Modify: `docs/ai-prompts/test.md`
- Modify: `docs/ai-prompts/wiki-ingest.md`
- Review: `.github/copilot-instructions.md`

- [x] Align prompts and templates with NestJS module boundaries and the actual Vitest suites
- [x] Preserve the repository's security, documentation, and verification rules
- [x] Keep templates reusable and avoid turning historical prompts into implementation claims

### Task 5: Verify documentation consistency

**Files:**
- Review all maintained Markdown files outside historical `docs/superpowers/plans/`, `docs/superpowers/specs/`, generated reports, and vendored skill copies

- [x] Search for stale branch names, deleted source paths, old package-manager commands, and obsolete test claims
- [x] Validate relative Markdown links and Wiki backlinks
- [x] Run `git diff --check`
- [x] Re-read the final diff for secrets, unsupported claims, accidental source edits, and scope creep
