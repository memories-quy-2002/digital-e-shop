# Prompt — Ingest knowledge into the Wiki

Copy, fill the `<…>` placeholders, and paste to the AI agent. Use this to grow `Wiki/` from the codebase or from new understanding.

---

Document into the Wiki: **<area, module, entity, concept, or decision>**

Goal: capture durable *understanding* (intent, contracts, relationships) — not copies of source that will drift.

Steps:

1. Read [AGENTS.md](../../AGENTS.md) → "LLM Wiki maintenance rules" and the current [Wiki/index.md](../../Wiki/index.md), `Wiki/overview.md`, and `Wiki/architecture.md`.
2. Inspect the relevant source first (use CodeGraph/Grep). Confirm facts against the code — verify any file/function/flag still exists before documenting it.
3. Choose the right location:
   - `Wiki/entities/<name>.md` — a domain object (Product, Order, Cart, User, Discount, Review, Address, Notification…).
   - `Wiki/concepts/<name>.md` — a cross-cutting concept (auth-and-csrf, validation, inventory-movement, api-response-shapes…).
   - `Wiki/decisions/NNNN-<slug>.md` — a single architectural decision (ADR).
   - `Wiki/sources/<name>.md` — notes distilled from a specific file or external doc.
   - `Wiki/synthesis/<name>.md` — a summary tying several pages together.
4. Write concise, factual Markdown. Link related pages with Obsidian wikilinks `[[page-name]]`. Start the page with a "Back to [[index]]" line.
5. Add the new page to the catalog in `Wiki/index.md`, bump its **Last updated** date, and append a one-line entry to `Wiki/log.md`.
6. Do not modify source code. Summarize: pages created/updated and the key facts captured.
