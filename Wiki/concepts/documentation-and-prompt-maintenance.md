# Documentation and prompt maintenance

Back to [[index]].

## TL;DR

Digital-E uses AGENTS.md for agent rules, docs/ for maintained human guides,
docs/ai-prompts/ for reusable task workflows, and Wiki/ for durable project
understanding. Keep each fact in one primary location, link related context,
and preserve source evidence when the implementation changes.

## Source of truth

- AGENTS.md: repository rules, safety boundaries, commands, and workflow policy
- docs/: maintained guides for setup, architecture, API behavior, testing,
  delivery, and project process
- docs/ai-prompts/: reusable prompt contracts and automatic task routing
- docs/superpowers/plans/ and docs/superpowers/specs/: historical task records
- Wiki/: durable architecture, domain relationships, decisions, concepts,
  source notes, and cross-page synthesis
- Wiki/log.md: append-only maintenance history for meaningful Wiki changes

When a source file defines current runtime behavior, code remains authoritative.
Use docs/ for the supported workflow and Wiki/ to explain intent, relationships,
and decisions. Do not copy implementation that will drift.

## Choose a documentation location

- Use docs/ for a task-oriented guide that a maintainer follows.
- Use docs/ai-prompts/ for a repeatable agent workflow with a stable prompt ID.
- Use Wiki/entities/ for one domain object and its relationships.
- Use Wiki/concepts/ for cross-cutting behavior or maintenance rules.
- Use Wiki/decisions/ for one accepted architectural or product decision.
- Use Wiki/sources/ for verified notes derived from specific source files or
  external references.
- Use Wiki/synthesis/ for a concise view that connects several Wiki pages.

Keep one page focused on one content type. Separate how-to steps, reference
facts, architectural explanation, and accepted decisions instead of combining
them into a page that has competing owners.

## Extend the prompt library

Read docs/ai-prompts/README.md before adding a prompt. Use the filename as its
stable ID and add the prompt to the inventory and routing matrix.

Every prompt needs a role, trusted task context, untrusted context, a safety
boundary, explicit edit permission, at least two labeled examples, and the
shared output contract. Test both a normal request and an injection-shaped
repository snippet before treating the prompt as ready.

## Maintain the Wiki

Start a new page with Back to [[index]], a short TL;DR, and a clear content
type. Link to source files, related Wiki pages, and the maintained guide that
owns the operational workflow.

When a meaningful Wiki page changes:

1. Update the relevant catalog entry in Wiki/index.md.
2. Bump the Last updated date in Wiki/index.md.
3. Append one concise line to Wiki/log.md.
4. Check every changed wikilink and backlink.
5. Separate current behavior, historical context, and proposed work.

Use placeholders as inline code when they describe a link pattern. Do not
create a real wikilink for a template name that has no target page.

## Review checklist

- The page has one clear audience and one primary job.
- Current behavior has evidence from source or a maintained guide.
- Decisions preserve rationale, consequences, and current status.
- Links use descriptive targets and resolve inside the repository or Wiki.
- Examples contain no secrets, real personal data, or unsupported metrics.
- Markdown remains readable in both GitHub and Obsidian.
- The page stays concise enough to maintain after the next architecture change.
