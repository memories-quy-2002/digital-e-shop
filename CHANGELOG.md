# Changelog

All notable changes to Digital-E are documented in this file.

This project follows Conventional Commit-style change grouping. Dates use
`YYYY-MM-DD`.

## [Unreleased]

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
