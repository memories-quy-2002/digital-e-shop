# Changelog

This file records notable Digital-E changes. Dates use `YYYY-MM-DD`, and entries follow the repository's Conventional Commit categories.

## [Unreleased]

### Added

- Guest cart persistence with server-authoritative preview, guest checkout, token-protected order lookup, and signed-in cart merge handling
- Guest-order contact and shipping snapshots with admin order compatibility
- Admin operations dashboard with range-aware analytics, operational queues, alerts, support tickets, and explicit loading, empty, and error states
- One-click prior-order address suggestions after checkout and structured shipping snapshots in order detail views
- Guarded production Prisma migration execution and manual backup-confirmed demo database reset workflow
- Local Docker MySQL setup, relational demo seed verification, and database-backed CI checks

### Changed

- Client and server now run as independent pnpm packages with Node.js `24.20.0` and pnpm `12.3.4`
- The server uses the flattened NestJS feature layout under `server/src/<feature>/`, with controllers, services, repositories, validators, and module wiring in each feature
- MySQL remains the primary runtime persistence layer; Prisma 7 owns the partial forward-migration layer and does not replace legacy repository access
- Authentication uses environment-bound local development login or server-verified Firebase identity in production, followed by cookie-backed JWT sessions
- Checkout reserves inventory before finalization, consumes reservations idempotently, and keeps USD as the canonical order amount while storing provider settlement details
- Product catalog data includes stable SKU/MPN identity, typed attributes, inventory movement records, and immutable order-item snapshots
- Transient Toasts render through a portal-mounted viewport with a maximum of three visible messages and responsive safe-area behavior
- Inactive Google OAuth, SearchAPI, MongoDB, Cloudinary transform, and Redis response-cache paths were removed from the active runtime

### Security

- CSRF, role, ownership, request validation, session rotation, guest-token hashing, path validation, rate limiting, migration guards, and immutable GitHub Action pins are documented and covered by focused tests
- Production and shared database operations now require explicit environment boundaries and forward migration checks

### Documentation

- Refreshed the root guides, API and architecture references, CI/CD notes, Wiki, contribution policies, and development templates against the current codebase

## [2026-05-15]

### Added

- Customer address book with saved addresses, default address handling, and checkout address selection
- Customer notification center with unread status support
- Order tracking timeline for customers and admins
- Inventory movement log for admin product operations and stock deductions
- Read-only k6 performance tests for public, customer, and admin endpoints
- Project documentation covering architecture, APIs, development, and testing

### Changed

- Refreshed storefront informational pages, including News, About, Support, Footer, and Home content
- Updated workspace package versions and related lockfile entries

### Fixed

- Promotion creation now works with the current `discounts` table schema
- Product ratings and review counts are derived from the `reviews` table
