# Prompt - Ingest knowledge into the Wiki

Copy, fill the `<...>` placeholders, and paste to the AI agent. Use this to
grow `Wiki/` from the codebase or from new understanding.

---

Document into the Wiki: **<area, module, entity, concept, or decision>**

Goal: capture durable understanding (intent, contracts, relationships), not
copies of source that will drift.

Steps:

1. Read [AGENTS.md](../../AGENTS.md) under "LLM Wiki maintenance rules" and
   read `Wiki/index.md`, `Wiki/overview.md`, and `Wiki/architecture.md`.
2. Inspect the relevant source first (use CodeGraph/Grep). Confirm facts against
   the code and verify that each file, function, flag, route, and environment
   variable still exists before documenting it. Current backend source is under
   `server/src/<feature>/` and is composed by `server/src/app.module.ts`.
3. Choose the right location:
   - `Wiki/entities/<name>.md` - a domain object such as Product, Order, Cart,
     User, Discount, Review, Address, or Notification.
   - `Wiki/concepts/<name>.md` - a cross-cutting concept such as auth/CSRF,
     validation, inventory movement, or API response shapes.
   - `Wiki/decisions/NNNN-<slug>.md` - one architectural decision (ADR).
   - `Wiki/sources/<name>.md` - notes distilled from a specific source file or
     external document.
   - `Wiki/synthesis/<name>.md` - a summary tying several pages together.
4. Write concise, factual Markdown. Link related pages with Obsidian wikilinks
   such as `[[architecture]]`. Start the page with `Back to [[index]]`.
5. Add a new page to the catalog in `Wiki/index.md`, bump its **Last updated**
   date, and append one line to `Wiki/log.md`. Do not rewrite completed plans or
   specs merely to make historical wording current; link to maintained docs.
6. Do not modify source code. Summarize pages created/updated and the key facts
   captured.
