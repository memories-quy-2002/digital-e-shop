# CLAUDE.md

Instructions for Claude Code working in this repository. This file is intentionally short — the authoritative project rules live in [AGENTS.md](./AGENTS.md).

## Read order (before doing work)

1. **[AGENTS.md](./AGENTS.md)** — tech stack, coding conventions, architecture rules, testing, security, Git workflow, Superpowers/Wiki/BMAD rules. This is the source of truth.
2. **[Wiki/index.md](./Wiki/index.md)** — the project knowledge base. Read it before any major change, and follow links into `Wiki/architecture.md` and the relevant `entities/`, `concepts/`, and `decisions/` pages.

If `AGENTS.md` and this file ever disagree, `AGENTS.md` wins.

## How to work

- **Use the Superpowers execution workflow** (see AGENTS.md → "Superpowers execution workflow"): inspect → clarify assumptions → plan → implement → test → review → summarize. Scale the ceremony to the task size.
- **Apply BMAD only when the task size requires it** (see AGENTS.md → "BMAD lightweight workflow"). Multi-file features, schema/contract changes, or work touching checkout, auth, inventory, or admin authorization warrant it. Typo fixes, copy tweaks, and single-function bug fixes do not.
- **Keep changes small and reviewable.** Make the smallest safe change. Match surrounding style. Do not rewrite unrelated code or change runtime behavior unasked.
- **Preserve contracts.** API response shapes, auth/CSRF/CORS behavior, route aliases, and role/ownership checks must not change unless explicitly requested.

## Wiki maintenance

After any meaningful change to **architecture, an API contract, the database schema, or core business logic**, update the affected `Wiki/` page in the same task, bump the "Last updated" date in `Wiki/index.md`, and append a one-line entry to `Wiki/log.md`. Use Obsidian wikilinks (`[[page-name]]`). See AGENTS.md → "LLM Wiki maintenance rules".

## Before the final response

Run the verification commands relevant to the surface you changed (see AGENTS.md → "Verification commands"). Doc-only changes need no build. Report what you ran and the result; name any command you could not run and why.

## This project at a glance

- pnpm workspace: `client/` (React 19 + Vite + TS) and `server/` (Express 5 + TS, MySQL primary, partial Prisma).
- Package manager: **pnpm only** — never add npm/yarn lockfiles.
- Default dev: `pnpm dev` (root) or `pnpm --filter server dev` + `pnpm --filter client start`.
- Frontend TS is `strict: true`; server TS is looser — preserve local style in touched files.

## Reusable task prompts

Starter prompts for common task types live in [docs/ai-prompts/](./docs/ai-prompts/): `feature.md`, `bugfix.md`, `refactor.md`, `test.md`, `wiki-ingest.md`.
