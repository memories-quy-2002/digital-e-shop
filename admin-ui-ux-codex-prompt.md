# Codex Prompt — Admin UI/UX Audit & Improvement

Use the following skills where relevant:

## Skills

### Primary
- `ui-ux-pro-max`
- `shadcn`
- `vercel-react-best-practices`

### Secondary
- `frontend-design` only for visual polish
- `21st MCP` only when a reusable UI pattern/reference is genuinely useful

---

Audit and improve the existing Admin interface at:

`http://localhost:5173/admin`

## Tech Stack

- React
- Vite
- TypeScript
- Tailwind CSS
- shadcn/ui

The Admin interface contains:

- sidebar navigation
- top header
- dashboard/content layout
- data tables such as Products, Users, and other management resources
- search/filter/sort/pagination
- CRUD actions

First inspect the existing implementation and rendered UI. **Do not start redesigning immediately.**

## Main Objective

Improve the Admin UI for operational efficiency, clarity, consistency, responsiveness, accessibility, and maintainability.

This is an administration application, **not a marketing/landing page**.

Prioritize:

```text
clarity > creativity
usability > decoration
information density > excessive whitespace
consistency > visual novelty
```

## 1. Layout

Review:

- sidebar width and hierarchy
- collapsed/expanded sidebar behavior
- active navigation state
- header height
- content max-width
- page padding
- alignment between header, page title, toolbar, and table
- scrolling behavior
- sticky header/sidebar where appropriate

Ensure the main content area uses available desktop space efficiently.

Avoid excessive cards wrapping every section.

## 2. Sidebar

Check:

- navigation grouping
- active item visibility
- icon consistency
- label alignment
- hover/focus states
- collapsed mode
- tooltips when collapsed
- mobile navigation behavior
- bottom actions such as profile/settings/logout

Do not overdecorate navigation.

## 3. Header

Review:

- breadcrumbs/page context
- global search if applicable
- notifications
- user/account controls
- mobile sidebar trigger

Avoid duplicating information already provided by the page header.

## 4. Data Tables

Treat tables as a high-priority Admin UX component.

Audit:

- column hierarchy
- column widths
- alignment
- row height
- typography
- status badges
- truncation
- overflow
- sorting
- search
- filters
- pagination
- bulk selection
- bulk actions
- row actions
- empty state
- loading state
- error state

Numeric columns should generally align appropriately.

Actions should not visually compete with primary data.

Use `DropdownMenu` for secondary row actions when appropriate.

Avoid placing too many standalone action buttons in every row.

Keep table density suitable for administrative workflows.

## 5. Search and Filters

Make search/filter controls easy to scan and reset.

Review:

- search field sizing
- filter placement
- active filter visibility
- clear/reset behavior
- responsive wrapping
- URL/query-state persistence when already supported

Do not change application behavior unnecessarily.

## 6. CRUD Interactions

Review Create/Edit/Delete flows.

Prefer appropriate shadcn primitives:

- `Dialog`
- `Sheet`
- `AlertDialog`
- `DropdownMenu`
- `Form`
- `Select`
- `Command`
- `Popover`

Destructive operations must be visually and semantically clear.

Avoid confirmation dialogs for harmless actions.

## 7. Responsive Behavior

Verify at least:

- large desktop
- laptop
- tablet
- mobile

The desktop Admin experience is the primary target, but mobile must remain usable.

For narrow screens:

- sidebar may become a Sheet/drawer
- toolbars may wrap/reorganize
- tables must have an intentional strategy

Do not simply shrink a desktop table until it becomes unreadable.

Use horizontal scrolling, hidden secondary columns, card/list representation, or another appropriate strategy based on the existing product requirements.

## 8. Accessibility

Check:

- keyboard navigation
- focus-visible states
- semantic buttons/links
- labels
- dialog focus management
- sufficient contrast
- icon-only button labels/tooltips
- table semantics

Target WCAG AA where practical.

## 9. Visual Design

Use `frontend-design` only to refine:

- typography hierarchy
- spacing
- alignment
- contrast
- restrained borders/shadows
- visual grouping

Do **not** introduce:

- unnecessary gradients
- glassmorphism
- oversized hero typography
- excessive animation
- decorative backgrounds
- arbitrary rounded cards everywhere
- generic AI-generated SaaS dashboard aesthetics

Preserve the existing product identity.

## 10. shadcn Conventions

Reuse existing project primitives first.

Do not create custom versions of:

- `Button`
- `Input`
- `Dialog`
- `Sheet`
- `Select`
- `DropdownMenu`
- `Badge`
- `Tooltip`
- `Table`

unless the existing abstraction genuinely cannot satisfy the requirement.

Use existing CSS variables and semantic Tailwind/shadcn tokens.

Avoid unnecessary arbitrary Tailwind values.

## 11. React Engineering

Apply `vercel-react-best-practices` where relevant.

Review:

- component boundaries
- unnecessary state
- unnecessary effects
- unnecessary rerenders
- memoization only where justified
- expensive table rendering
- event handlers
- derived state
- reusable admin components

Do not overengineer abstractions prematurely.

Shared patterns such as:

- `DataTable`
- `PageHeader`
- `AdminToolbar`
- `EmptyState`
- `Pagination`
- `ConfirmDeleteDialog`

may be extracted when multiple pages genuinely share the same behavior.

## Workflow

Before editing:

1. Open `/admin` in the browser.
2. Inspect the rendered page at desktop size.
3. Inspect sidebar, header, toolbar, and tables.
4. Navigate through representative Admin pages such as Products and Users.
5. Inspect the corresponding React components and Tailwind/shadcn implementation.
6. Identify concrete problems.
7. Rank them as P0 / P1 / P2.

Then implement the highest-value improvements.

Do not perform a complete visual rewrite unless the existing architecture makes incremental improvement impractical.

## Verification

After implementation:

- reopen all modified Admin pages
- verify sidebar navigation
- verify desktop and mobile layouts
- verify table overflow
- verify search/filter/pagination
- verify dialogs/dropdowns
- verify loading/empty/error states
- verify hover/focus/disabled states
- check browser console errors
- run TypeScript typecheck
- run lint
- run relevant tests

Take screenshots before and after when browser tooling supports it.

## Final Report

At the end, provide a concise summary containing:

- issues found
- changes made
- components affected
- UX improvements
- remaining recommendations
