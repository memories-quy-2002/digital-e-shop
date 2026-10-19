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
- The package manager is pnpm `12.4.2`; the runtime is Node.js `24.20.0`
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

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **digital-e-shop** (76088 symbols, 93720 relationships, 532 execution flows).

> Index stale? Run `node .gitnexus/run.cjs analyze --index-only` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? Bootstrap with `npx`, `bunx`, or `pnpm dlx` — e.g. `bunx gitnexus@latest analyze` (npm 11 npx crash; #1939).

## Always Do

- **MUST run impact before editing.** Use `impact({target: "symbolName", direction: "upstream"})` or `node .gitnexus/run.cjs impact "symbolName" --direction upstream --repo .`; report callers, processes, and risk. Never substitute grep for graph analysis.
- **MUST analyze graph changes before committing.** Use `detect_changes({scope: "all"})` (MCP) or `node .gitnexus/run.cjs detect-changes --scope all --repo .` (CLI fallback). `partial: true` or `truncated: true` is not a clean check — a zero means unseen, not unaffected; re-run it. For regression review: `detect_changes({scope: "compare", base_ref: "main"})` or `node .gitnexus/run.cjs detect-changes --scope compare --base-ref "main" --repo .`.
- MUST warn on HIGH/CRITICAL `risk` pre-edit; never use `riskSharedAxes` to waive a HIGH/CRITICAL `risk` warning. Compare File/symbol: MCP File omits axes; Graph-RAG expands File.
- **MUST treat `risk: UNKNOWN` as unresolved, not as low.** An empty caller set is not evidence the symbol is unused — it can also mean the callers are not resolvable by the index (plain-object property access, dynamic dispatch, cross-language calls). `impact` pairs `UNKNOWN` with a `riskNote` saying so. Confirm with a text search before treating the symbol as safe to change or delete; do not proceed on the strength of a zero.
- **MUST use `query({search_query: "concept"})` for concepts/flows, `context({name: "symbolName"})` for a named symbol, or `impact` for blast radius, on read-only callers, dependencies, imports, or execution flow.** Graph first; text search only for empty/`UNKNOWN`/literals.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method before MCP/CLI impact analysis.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis, and never read `UNKNOWN` as an all-clear — it means the walk could not answer, which is the one verdict that requires confirming by other means.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit before MCP/CLI graph change analysis.

## Resources

| Resource | Use for |
| --- | --- |
| `gitnexus://repo/digital-e-shop/context` | Codebase overview, check index freshness |
| `gitnexus://repo/digital-e-shop/clusters` | All functional areas |
| `gitnexus://repo/digital-e-shop/processes` | All execution flows |
| `gitnexus://repo/digital-e-shop/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
| --- | --- |
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
