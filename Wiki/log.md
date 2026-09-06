# Maintenance log

Append-only. One line per notable project maintenance operation. Newest at the bottom.

Format: `YYYY-MM-DD — <author> — <what changed>`

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
- 2026-09-06 — Codex — Rebuilt server startup from source, ignored comments-only env overrides, and refreshed the Aiven Project CA GEN 2 certificate used for verified MySQL TLS connections.
- 2026-09-06 — Codex — Refreshed the three workspace manifests and lockfile to pnpm 12.3.4 and Node 24.20.x LTS metadata, removed the deprecated root pnpm settings and unused `claude` dependency, and kept NestJS 11, Prisma 7, and TypeScript 6 for current CommonJS/tooling compatibility.
- 2026-09-06 — Codex — Serialized Prisma Client generation with a temporary cross-process lock so concurrent Windows installs/builds cannot delete and recreate `src/generated/prisma` at the same time.
- 2026-09-06 — Codex — Added an explicit `ALLOW_REMOTE_DATABASE=true` opt-in for intentional remote development startup while keeping mock/demo seeding local-only.
- 2026-09-06 — Codex — Split local startup compilation from the full Prisma-generating deployment build so `pnpm start` does not rewrite generated files on every launch.
