# Maintenance log

Append-only. One line per notable project maintenance operation. Newest at the bottom.

Format: `YYYY-MM-DD — <author> — <what changed>`

- 2026-09-10 — Codex — Extended Resend confirmation delivery to authenticated customers using server-authoritative email addresses and account-order links.
- 2026-09-10 — Codex — Masked guest access tokens with explicit Reveal/Copy controls and added optional post-commit Resend confirmation emails without sending raw tokens.

- 2026-09-04 — Codex — Hardened CI/CD with disposable MySQL 8.4, legacy-plus-Prisma migration validation, database integration tests, immutable GitHub Action pins, CodeQL/dependency review, automation-secret removal, and documented external Vercel/branch-protection gates in [[architecture]] and [[overview]].
- 2026-09-04 — Codex — Isolated local MySQL from production targets with a local-only Docker database/volume, fail-fast runtime and Prisma guards, protected mock seeding, and explicit local/CI/production environment documentation.
- 2026-09-04 — Codex — Updated CI security workflow to rely on GitHub CodeQL default setup and retain dependency review without conflicting advanced uploads.
- 2026-09-04 — Codex — Fixed CI and local migration ordering by recording the metadata-only Prisma legacy baseline before applying pending migrations.
- 2026-09-04 — Codex — Pinned the Vercel install step to the repository's Corepack-managed pnpm version so the digital-e-server deployment accepts the workspace lockfile overrides.
- 2026-09-04 — Codex — Allowed schema-only Prisma generation during Vercel installation while retaining database-target protection for migration and runtime connections.
- 2026-09-04 — Codex — Mirrored pnpm security overrides in root package metadata so Vercel's native serverless install phase remains compatible with pnpm 9 without changing the canonical pnpm 11 workspace configuration.
- 2026-09-04 — Codex — Added a transactional, idempotent local MySQL demo seed with linked admin/customer accounts, realistic catalog products with populated storefront image slugs, carts, orders, reviews, wishlists, addresses, notifications, sessions, discounts, and inventory movements; wired Prisma seed/verification commands and documented the remote-target guard.
- 2026-09-04 — Codex — Expanded the local demo catalog to 28 linked products across 8 categories and 16 brands; connected every product to demo orders, reviews, wishlists, images, and FK/orphan verification.
- 2026-09-04 — Codex — Standardized backend success/error metadata with request correlation IDs and structured access/error logging; added critical auth, ownership, checkout, Stripe webhook, response-contract, and observability specs, and fixed Nest role metadata attachment.
- 2026-09-06 — Codex — Moved login and registration to server-verified Firebase ID tokens, made public auth schemas strict, and enforced customer-only public registration.
- 2026-09-06 — Codex — Hardened refresh identity reloading, suspended-user rejection, stale refresh-cookie cleanup, and explicit missing Firebase ID-token validator coverage.
- 2026-09-06 — Codex — Completed production hardening through rotating sessions, transactional reservations/promotions/audit writes, immutable catalog snapshots and structured attributes, migration-owned schema, Redis rate limiting, Playwright E2E harness, CI gates, and synchronized architecture documentation.
- 2026-09-07 — ChatGPT — Synchronized production hardening with the latest main runtime/dependency refresh, standardized Node 24.20.0 and pnpm 12.3.4, retained Firebase Admin and Playwright requirements, and regenerated the workspace lockfile.
- 2026-09-07 — Codex — Split client and server into independent pnpm package roots, added Prisma preparation before server startup, and removed the Playwright E2E project and CI job.
- 2026-09-07 — Codex — Pinned Node.js 24.20.0 and pnpm 12.3.4, required explicit production API/env configuration, restricted production CORS origins, removed obsolete Jest/Babel tooling, and added HTTP CI smoke checks.
- 2026-09-07 — Codex — Replaced demo catalog image slugs with 28 verified Unsplash HTTPS URLs, added external-image client support, and reset/reseeded the local Docker catalog with zero legacy E2E/Demo products.
- 2026-09-07 — Codex — Documented the approved order lifecycle, payment ledger with USD canonical currency and PayOS VND quotes, Done-only reviews, persisted support tickets, and database-backed operational alerts.
- 2026-09-07 — Codex — Added environment-bound local MySQL password login for seeded development accounts while keeping production login Firebase-only, with shared session issuance and auth-flow coverage.
- 2026-09-07 - Codex - Finalized symbolic payment boundaries so unconfigured live PayOS fails closed, while Stripe refunds retain deterministic idempotency and USD/PayOS-VND quote rules.
- 2026-09-07 - Codex - Added a local mock Stripe checkout path that finalizes a reserved order without contacting Stripe and returns to the local success page.
- 2026-09-07 - Codex - Refreshed Checkout with the dark technical/electronics visual hierarchy, accessible progress/payment states, normalized email validation, and regression coverage.
- 2026-09-07 - Codex - Moved transient Toasts to a portal-mounted fixed viewport outside the Header/app layout, capped the visible queue at three, and added responsive safe-area/reduced-motion behavior with regression coverage.
- 2026-09-08 - Codex - Removed redundant root pnpm package metadata and kept client/server dependency resolution in their package-local lockfiles and workspace policies.
- 2026-09-09 - Codex - Added the additive Admin analytics range contract for the operations-first Dashboard.
- 2026-09-08 - Codex - Removed inactive Google OAuth and SearchAPI runtime references, dependencies, templates, and OpenAPI entries while retaining nullable legacy provider columns for schema compatibility.
- 2026-09-08 - Codex - Added a protected main-push Prisma production migration gate and a manual, backup-confirmed full demo reset workflow that reloads the committed legacy baseline, applies forward migrations, runs the demo seed, and verifies relational counts.
- 2026-09-08 - Codex - Documented guest cart persistence, token-protected guest checkout and lookup, nullable order identity, and admin compatibility boundaries.
- 2026-09-08 - Codex - Hardened local startup verification with pnpm 12-compatible server scripts, idempotent Prisma generation metadata, and a Vite cache outside node_modules.
- 2026-09-08 - Codex - Verified guest cart and checkout end-to-end against local Docker MySQL with Playwright, and added the signed-in guest-cart merge prompt discovered during smoke testing.
- 2026-09-08 - Codex - Completed Task 9 verification under Node 24.20.0 and pnpm 12.3.4; added a Windows-safe client build fallback and removed the auth redirect lint blocker without changing redirect validation behavior.
- 2026-09-09 - Codex - Preserved structured shipping snapshots for Admin order detail, cleared the active cart after confirmed checkout, and added one-click prior-order address suggestions.
- 2026-09-10 - Codex - Refreshed maintained project docs, policies, guides, Wiki pages, ADRs, prompts, and templates against the current independent client/server NestJS runtime; historical plans and specs were preserved.
- 2026-09-10 - Codex - Added provider-aware signup, server-owned Resend email verification, unverified-session access policy, and verified checkout/review guards.
- 2026-09-10 - Codex - Added password-reset and email-change confirmation flows, security notices, and persisted Resend-backed marketing subscriptions with one-time unsubscribe links.
- 2026-09-10 - Codex - Implemented Vietnam-first PayOS payment links with server-snapshotted VND quotes, provider-neutral pending checkout references, signed webhook finalization, guest/authenticated status polling, and local mock coverage.
- 2026-09-10 - Codex - Gated customer-facing Resend delivery on email verification and marked all demo seed accounts as verified.
- 2026-09-10 - Codex - Converted the guarded demo seed and new checkout ledger path to Vietnam-first whole-number VND, added VND storefront formatting, fixed FK-safe demo cleanup, and replaced auto-confirming mock PayOS with an explicit local simulator.
- 2026-09-10 - Codex - Added a dedicated customer notifications page with expandable details, per-item Mark read controls, and the existing View all route from the header.
- 2026-09-10 - Codex - Moved customer notification updates back into Account section 4; View all and the legacy notifications route now target Account#notifications.
- 2026-09-10 - Codex - Fixed mock PayOS finalization by binding the VND currency value in the order insert and verified idempotent confirmation against local MySQL.
- 2026-09-10 - Codex - Switched local client/server environment loading to the example-backed local files, aligned Prisma CLI with the same local-first resolution, and verified signup against Docker MySQL after a remote-database false positive.
- 2026-09-10 - Codex - Standardized the active local workflow on `client/.env` and `server/.env`, reseeded the VND demo graph, and verified that server development no longer reads the remote database target.
