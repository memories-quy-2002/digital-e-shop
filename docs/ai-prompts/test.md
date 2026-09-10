# Prompt - Add tests

Copy, fill the `<...>` placeholders, and paste to the AI agent.

---

Add tests for: **<component, function, or flow>**

Follow the Superpowers workflow. Before editing:

1. Read [AGENTS.md](../../AGENTS.md) (Testing section) and [Wiki/index.md](../../Wiki/index.md).
2. Inspect the target code and existing behavior/contracts first. The client and server both use Vitest; the server also has an opt-in MySQL-backed integration configuration and read-only k6 scripts.

Then:

3. Plan the cases that matter: happy path, edge cases, error/empty states, and auth/ownership branches.
4. Add focused tests:
   - **Frontend** - Vitest + Testing Library for logic-heavy components, route guards, and UI state transitions. Place tests next to the unit or under the existing test path; mock network through the HTTP layer.
   - **Backend** - Vitest unit tests for services, guards, repositories, and contracts; use `test:integration` only with the configured isolated MySQL database.
   - **Performance** - k6 for read-only paths only, unless a cloned test database exists.
5. Do not change production behavior to make tests pass; fix the test or flag a real bug.
6. Run the owning package commands, for example `pnpm --dir client test -- --run` or `pnpm --dir server test -- --run`, plus typecheck for the touched package.
7. Update `Wiki/` only if testing revealed a behavior or contract worth recording.
8. Summarize tests added, what they cover, results, and gaps left untested.
