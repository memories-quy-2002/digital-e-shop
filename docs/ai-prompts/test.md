# Prompt — Add tests

Copy, fill the `<…>` placeholders, and paste to the AI agent.

---

Add tests for: **<component, function, or flow>**

Follow the Superpowers workflow. Before editing:

1. Read [AGENTS.md](../../AGENTS.md) (Testing section) and [Wiki/index.md](../../Wiki/index.md).
2. Inspect the target code and its existing behavior/contracts first. Note: the client has **Vitest + Testing Library configured but no committed test files yet**; the server has no unit suite (only k6 read-only scripts).

Then:

3. Plan which cases matter: happy path, edge cases, error/empty states, and any auth/ownership branch.
4. Add focused tests:
   - **Frontend** — Vitest + Testing Library for logic-heavy components, route guards, and UI state transitions. Place tests next to the unit or under a conventional test path; mock network via the existing HTTP layer.
   - **Backend** — add tests only if introducing a harness deliberately; otherwise verify changed flows via targeted runtime checks and keep logic isolated enough to test later.
   - **Performance** — k6 for read-only paths only, unless a cloned test DB exists.
5. Do not change production behavior to make tests pass — fix the test or flag a real bug.
6. Run `pnpm --filter client test` (and typecheck) to confirm the suite passes.
7. Update `Wiki/` only if testing revealed a behavior/contract worth recording.
8. Summarize: tests added, what they cover, results, and any gaps left untested.
