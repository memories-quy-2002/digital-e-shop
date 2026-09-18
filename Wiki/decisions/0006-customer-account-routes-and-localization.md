# Customer account route namespace and locale parity

**Status:** Accepted
**Date:** 2026-09-18

Customer-facing account surfaces use the account namespace:

- /account â€” account overview
- /account/orders â€” order history
- /account/addresses â€” saved addresses
- /account/notifications â€” notification updates

Legacy /orders, /addresses, and /notifications paths remain as client-side redirects so bookmarked links and historical notification URLs continue to work. New internal links and generated order notification links use the canonical paths.

Account, order history, address book, and notification UI copy is read from the shared English/Vietnamese dictionaries. The page keeps data values such as customer names, product names, and server-provided error messages untouched.