# Prompt - Implement a feature

Copy, fill the `<...>` placeholders, and paste to the AI agent.

---

Implement: **<feature description>**

Follow the Superpowers workflow. Before editing:

1. Read [AGENTS.md](../../AGENTS.md) and [Wiki/index.md](../../Wiki/index.md); follow links into `Wiki/architecture.md` and the relevant concepts/decisions.
2. Inspect the relevant files first (use CodeGraph/Grep to map the touched surface). Choose the correct `client/src/features/<domain>/` and/or `server/src/<feature>/` Nest module location.
3. If the task is non-trivial (multi-file, schema/contract change, or touches checkout/auth/inventory/admin), apply the BMAD steps in [docs/bmad/](../bmad/): short PRD, architecture note or ADR, and small stories.

Then:

4. State assumptions; ask only if a choice genuinely changes behavior.
5. Plan the change as a short step list before editing.
6. Implement the smallest safe change. Match surrounding style. Preserve API response shapes, auth/CSRF/CORS, route aliases, and role/ownership checks. Validate write payloads with Zod. Do not add dependencies without justification.
7. Add targeted tests where practical: Vitest/Testing Library on the client, and focused Vitest unit or integration coverage on the server when the harness fits.
8. Run the relevant package-local verification commands (typecheck, test, build, and lint for the touched surface).
9. Update `Wiki/` if architecture, an API contract, the database schema, or business logic changed; append to `Wiki/log.md` and bump the date in `Wiki/index.md`.
10. Summarize changed files, behavior changes, verification results, anything that could not run, assumptions, and remaining risks.
