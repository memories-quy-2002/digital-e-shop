# Prompt — Fix a bug

Copy, fill the `<…>` placeholders, and paste to the AI agent.

---

Fix: **<bug description, including how to reproduce and expected vs actual>**

Follow the Superpowers workflow. Before editing:

1. Read [AGENTS.md](../../AGENTS.md) and [Wiki/index.md](../../Wiki/index.md).
2. Inspect the relevant files first. Trace the actual code path (use CodeGraph/Grep) and confirm the **root cause** before changing anything — don't patch symptoms.

Then:

3. State the root cause and your fix approach as a short plan.
4. Make the smallest safe change that fixes the root cause. Preserve API contracts, auth/CSRF/CORS, route aliases, and role/ownership checks. Avoid unrelated refactors.
5. Add or adjust a test that would have caught this, where practical.
6. Run the relevant verification commands (typecheck / build / lint for the touched surface).
7. Update `Wiki/` only if the fix changed architecture, an API contract, the schema, or business logic; if so, append to `Wiki/log.md`.
8. Summarize: root cause, changed files, behavior change, verification results, and any residual risk or related areas worth watching.
