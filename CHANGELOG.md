# Changelog

All notable changes to Digital-E are documented in this file.

This project follows Conventional Commit-style change grouping. Dates use
`YYYY-MM-DD`.

## [Unreleased]

### Added

- Local Docker MySQL 8 development environment (`docker-compose.yml`, import
  and seed scripts, `docker:*` pnpm scripts) so contributors can run the
  database locally instead of depending on the remote Aiven instance.
- Committed `server/.env.example` documenting server environment variables
  with placeholder values.
- Read-only k6 performance scenarios for catalog and auth endpoints.
- Continuous integration workflow (`ci.yml`) running typecheck, lint, test,
  and build for the client and server on every push and pull request to
  `main`, enforced by branch protection.

### Changed

- "Relevant products" are now computed directly in MySQL with co-purchase
  weighting, replacing the previous MongoDB-backed lookup. The `mongodb`
  dependency and `MONGO_URI` configuration were removed.
- Dependabot now opens a single grouped pull request per ecosystem (npm and
  GitHub Actions), corrected to the valid `npm` ecosystem for the pnpm
  workspace, with major-version bumps of framework dependencies ignored.
- Pinned an explicit pnpm `minimumReleaseAge` supply-chain policy so
  frozen-lockfile installs pass deterministically in CI.
- Client image handling now serves images directly from Vercel Blob; the
  unused Cloudinary transform path and its environment variable were removed.

### Planned

- Add broader automated coverage for customer checkout, admin reporting, and
  promotion workflows.
- Expand performance tests against a cloned test database for write-heavy
  scenarios.
- Improve accessibility coverage for storefront and admin UI flows.

## [2026-05-15]

### Added

- Customer address book with saved addresses, default address handling, and
  checkout address selection.
- Customer notification center with unread status support.
- Order tracking timeline for customers and admins.
- Inventory movement log for admin product operations and stock deductions.
- Read-only k6 performance tests for public, customer, and admin endpoints.
- Project documentation covering architecture, APIs, development, and testing.

### Changed

- Refreshed storefront informational pages, including News, About, Support,
  Footer, and Home content.
- Updated the root README with current setup, feature, and verification notes.
- Updated workspace package versions and related lockfile entries.

### Fixed

- Promotion creation now works with the current `discounts` table schema.
- Product ratings and review counts are treated as derived review data instead
  of product table columns.
