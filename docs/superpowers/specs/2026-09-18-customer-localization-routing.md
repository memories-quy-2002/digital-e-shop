# Customer account localization and route structure

## Goal

Make the customer account, orders, addresses, and notification-update screens fully bilingual and give them a consistent account-scoped URL structure.

## Requirements

- Add English and Vietnamese copy for visible customer-account UI, including loading, empty, success, error, action, status, payment, and notification states.
- Use `/account`, `/account/orders`, `/account/addresses`, and `/account/notifications` as canonical customer routes.
- Preserve `/orders`, `/addresses`, and `/notifications` as compatibility redirects, preserving the order query string when present.
- Update customer navigation and storefront links to use canonical routes.
- Keep existing API paths, auth/session protection, and notification response contracts unchanged.
- Add focused regression coverage for locale rendering and route redirects.
