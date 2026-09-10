# CLAUDE.md

This file gives Claude Code a short entry point. The authoritative project rules live in [AGENTS.md](./AGENTS.md).

## Read order

1. Read [AGENTS.md](./AGENTS.md) for coding, testing, security, Git, Wiki, and workflow rules
2. Read [Wiki/index.md](./Wiki/index.md), then follow the relevant architecture, concept, entity, and decision links
3. Read the maintained guide for the surface you will change under [docs/](./docs/)

If this file and `AGENTS.md` disagree, `AGENTS.md` wins.

## Project at a glance

- `client/` is an independent React 19, Vite 8, TypeScript, Tailwind CSS, Radix UI, and SCSS package
- `server/` is an independent NestJS 11 API on the Express 5 adapter
- MySQL is the primary runtime database; Prisma 7 is a partial, forward-migration-owned layer
- The current server source tree uses feature directories such as `auth`, `cart`, `orders`, `payments`, `products`, `support`, and `users`
- The package manager is pnpm `12.3.4`; the runtime is Node.js `24.20.0`
- Run client and server commands with `pnpm --dir client ...` and `pnpm --dir server ...`
- The client and server both have Vitest coverage; server integration tests require a disposable MySQL database

## Working rules

- Inspect source, package scripts, environment templates, and current Wiki notes before editing
- Keep API response keys, cookie sessions, CSRF behavior, route aliases, role checks, and ownership checks stable unless the task explicitly changes them
- Keep SQL and Prisma persistence inside server repositories, business rules in services, and request parsing in controllers and validators
- Use existing client HTTP helpers, contexts, feature API modules, and UI primitives
- Preserve unrelated worktree changes and avoid adding root orchestration or unnecessary dependencies
- Update maintained documentation when architecture, API contracts, schema, business rules, commands, or security boundaries change

## Verification

Run the checks relevant to the changed package and report exact results:

```powershell
pnpm --dir client exec tsc -p tsconfig.json --noEmit
pnpm --dir client lint
pnpm --dir client test -- --run
pnpm --dir client build

pnpm --dir server typecheck
pnpm --dir server lint
pnpm --dir server test -- --run
pnpm --dir server build
```

Use `pnpm --dir server test:integration` only with the isolated local or CI database. Doc-only changes do not require a package build, but run `git diff --check` and verify links and stale references.

## Reusable prompts

Common task prompts live in [docs/ai-prompts/](./docs/ai-prompts/). The durable project knowledge base lives in [Wiki/](./Wiki/).
