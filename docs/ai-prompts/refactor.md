# Prompt - Refactor

Copy, fill the `<...>` placeholders, and paste to the AI agent.

---

Refactor: **<what to refactor and the goal - readability, structure, performance, etc.>**

This must be **behavior-preserving** unless explicitly stated otherwise.

Follow the Superpowers workflow. Before editing:

1. Read [AGENTS.md](../../AGENTS.md) and [Wiki/index.md](../../Wiki/index.md), especially `Wiki/architecture.md`.
2. Inspect the affected code and its callers (use CodeGraph callers/callees) so the full impact surface is understood.

Then:

3. Plan the refactor as small, reviewable steps. Do not add an abstraction layer unless the existing structure is clearly insufficient.
4. Keep public APIs, response shapes, route aliases, cookie/CSRF flow, and module boundaries intact. Respect Nest `module/controller/service/repository` boundaries under `server/src/<feature>/` and the client feature-folder conventions.
5. Do not change runtime behavior or add dependencies without justification.
6. Run relevant package-local verification commands (typecheck, test, build, and lint) and confirm output is unchanged where possible.
7. Update `Wiki/architecture.md` and `Wiki/log.md` if the refactor changes structure or boundaries.
8. Summarize what moved/changed, why it is behavior-preserving, verification results, and remaining risks.
