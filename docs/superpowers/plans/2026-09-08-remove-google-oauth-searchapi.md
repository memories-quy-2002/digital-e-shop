# Remove Google OAuth and SearchAPI Implementation Plan

> **For agentic workers:** This plan is executed inline on the current branch. Do not create a worktree or commit unless the user explicitly requests it.

**Goal:** Remove the unused Google OAuth and SearchAPI integrations while preserving local/Firebase authentication, Vercel Blob image uploads, and existing database compatibility.

**Architecture:** Remove dead client social-login affordances, server social-auth orchestration, provider configuration, SearchAPI image-fetch tooling, unused dependencies, and current runtime documentation. Keep nullable legacy user provider columns and their historical migration because Google OAuth was never active in the current Nest runtime.

**Tech Stack:** React/Vite, NestJS/Express, TypeScript, pnpm package-local lockfiles, JSON OpenAPI documentation, Markdown environment templates.

## Global Constraints

- Preserve local and Firebase email authentication, JWT sessions, CSRF, and ownership checks.
- Do not expose or rewrite values in ignored `.env`, `.env.local`, or `.env.docker` files.
- Use package-local pnpm commands; do not restore root workspace files removed by the existing branch changes.
- Preserve unrelated dirty changes already present on the current branch.
- Do not drop legacy database columns in this cleanup.

### Task 1: Remove client Google OAuth affordances

**Files:**
- Modify: `client/src/features/auth/pages/LoginPage.tsx`
- Modify: `client/src/features/auth/pages/SignupPage.tsx`
- Delete: `client/src/features/auth/components/SocialAuthButtons.tsx`
- Delete: `client/src/features/auth/utils/socialAuth.ts`

- [x] Remove social query-message handling and no-op component imports/usages from both auth pages.
- [x] Delete the now-unreferenced social-auth helper and component.
- [x] Verify no client source imports or references the removed modules.

### Task 2: Remove server Google OAuth and SearchAPI runtime code

**Files:**
- Modify: `server/src/auth/auth.service.ts`
- Modify: `server/src/auth/auth.types.ts`
- Modify: `server/src/users/users.repository.ts`
- Modify: `server/src/shared/interfaces/domain.ts`
- Modify: `server/src/config/env.config.ts`
- Delete: `server/fetchProductImages.js`

- [x] Remove unused social profile creation/login methods and types without changing password/Firebase login.
- [x] Remove unused Google/SearchAPI environment properties.
- [x] Delete the standalone SearchAPI image-fetch utility.
- [x] Keep database schema fields/migrations as nullable legacy compatibility columns.

### Task 3: Remove dependencies and active configuration references

**Files:**
- Modify: `server/package.json`
- Modify: `server/pnpm-lock.yaml`
- Modify: `server/.env.example`
- Modify: `AGENTS.md`
- Modify: `Wiki/overview.md`
- Modify: `Wiki/architecture.md`
- Modify: `server/src/docs/openapi.json`

- [x] Remove Passport/Google OAuth dependencies and regenerate only the server lockfile.
- [x] Remove Google OAuth and SearchAPI entries from tracked environment templates and current runtime docs.
- [x] Remove stale Google OAuth OpenAPI tag text and paths.
- [x] Leave historical superpowers specs unchanged unless they describe current runtime behavior rather than past work.

### Task 4: Audit environment completeness and verify

- [x] Confirm client templates contain the required public `VITE_API_BASE_URL` and no secret values.
- [x] Confirm server templates contain database, JWT/CSRF, URL, Firebase production, Blob upload, Stripe conditional, and Redis conditional settings.
- [x] Report legacy keys found in ignored personal env files without printing their values.
- [x] Run reference search, client typecheck/build/lint/tests, server typecheck/build/lint, and inspect the final diff for unrelated changes.
