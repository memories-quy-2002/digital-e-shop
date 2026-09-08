# Guest Cart and Guest Checkout Design

**Date:** 2026-09-08
**Status:** Approved for implementation
**Scope:** Allow an unauthenticated shopper to add products to a browser-local cart and complete the existing checkout methods without creating an account.

## Goal

Digital-E should support a complete guest shopping journey:

1. A visitor adds products from the home page, catalog, or product detail page.
2. The cart survives refreshes in the same browser.
3. The server rechecks product availability, prices, promotions, and payment inputs before creating an order.
4. The visitor completes cash, bank transfer, PayOS, or Stripe/Card checkout without logging in.
5. The visitor receives a one-time-visible order access token and can look up the order with the order ID and token.
6. Existing authenticated cart, order history, address-book, wishlist, and admin flows continue to work.

## Current constraints

- The client and server are independent pnpm packages.
- MySQL repositories are the operational persistence layer; Prisma schema and migrations must stay aligned with the raw SQL model.
- The current cart tables are user-owned and the current order and Stripe reservation services require a user ID.
- The current checkout supports cash, bank transfer, PayOS, and Stripe/Card paths.
- The current checkout already validates email, shipping address, city, and payment method on the client, but the server must remain authoritative.
- The current order status contract remains 0 = Pending, 1 = Done, and 2 = Canceled.
- The existing server 500 remediation is outside this feature. This feature must not change deployment configuration or production environment values.

## Decisions

### 1. Guest cart storage

Guest cart state is stored in localStorage under the versioned key digital-e:guest-cart:v1.

The persisted shape is intentionally minimal:

    {
        "items": [
            { "productId": 182, "quantity": 2 }
        ]
    }

The client never persists a trusted price, discount, stock value, or user ID in the guest cart. Product details displayed in the cart come from the server preview response. If the preview request fails, the UI shows a recoverable error instead of silently treating the cart as empty.

The cart context has two sources:

- Authenticated user: existing server cart endpoints and ownership checks.
- Guest: localStorage entries plus the public server preview endpoint.

When a guest signs in while a guest cart exists, the client offers a merge into the authenticated cart. The merge uses the existing authenticated cart write path, lets the server revalidate stock, and clears local guest entries only after all items are accepted.

### 2. Server-authoritative guest preview

The public preview endpoint is:

    POST /api/cart/guest/preview

Request:

    {
        "items": [
            { "productId": 182, "quantity": 2 }
        ],
        "discountCode": "SAVE10"
    }

The discount code is optional. The endpoint reads products and current stock from MySQL, calculates the current merchandise total, checks the active promotion, and returns the same normalized cart item shape used by the authenticated cart. It returns validation issues for unavailable products, out-of-stock products, and insufficient quantities.

The preview is not an inventory reservation and does not create a cart row. The final purchase or Stripe reservation repeats the authoritative read and transactionally validates the cart.

### 3. Guest order identity

Guest orders use a nullable user relationship and a contact snapshot:

- orders.user_id becomes nullable.
- orders.guest_email stores the checkout email.
- orders.guest_name stores the recipient name.
- orders.guest_phone stores the optional phone number.
- orders.guest_order_token_hash stores a SHA-256 hash of a random access token.

Stripe pending checkouts store the same nullable user relationship, guest contact snapshot, and token hash so the webhook can finalize the order without an authenticated session.

The raw guest order token is returned only when the order or checkout session is created. It is stored in sessionStorage for the current checkout-success flow and is never logged or persisted by the client in the cart. The database stores only the hash. Public lookup requires both the numeric order ID or Stripe session ID and the raw token.

### 4. Guest checkout API

Guest checkout uses structured contact and shipping input:

    {
        "cart": [
            { "productId": 182, "quantity": 2 }
        ],
        "contact": {
            "email": "buyer@example.com",
            "name": "Buyer Name",
            "phone": "+84123456789"
        },
        "shipping": {
            "address": "123 ABC Street",
            "city": "Ho Chi Minh City",
            "country": "Vietnam"
        },
        "discountCode": "SAVE10",
        "paymentMethod": "cash"
    }

The server serializes the shipping snapshot into the existing shipping address field for compatibility and stores the contact fields separately for guest order display and admin operations.

Endpoints:

- POST /api/orders/guest/purchase creates a cash, bank transfer, or PayOS order and returns { orderId, order, guestOrderToken, paymentMethod, msg }.
- POST /api/orders/guest/checkout-session creates a Stripe/Card reservation and returns { url, guestOrderToken, msg }.
- POST /api/orders/guest/by-session accepts { sessionId, guestOrderToken } and returns the finalized order after the Stripe webhook completes.
- POST /api/orders/guest/lookup accepts { orderId, guestOrderToken } and returns a guest-safe order detail.

All guest writes use the existing CSRF middleware and rate-limit middleware. Every request uses Zod validation. The guest endpoints never accept a user ID and never trust client-provided prices or totals.

### 5. Payment and reservation behavior

The existing payment methods remain available:

- Cash and bank transfer create an order through the normal transactional order path.
- PayOS keeps its existing symbolic/configured provider behavior and USD/VND quote rules.
- Stripe/Card uses the existing pending checkout and inventory reservation flow, generalized to accept a nullable user ID and guest contact snapshot.

The shared order service is generalized around an order identity object instead of duplicating inventory and payment logic for guests. Authenticated callers continue to derive the identity from the session and owner guard. Guest callers always use user_id = NULL and the validated guest contact.

Guest promotion codes remain supported because the cart already exposes the coupon flow. discount_redemptions.user_id becomes nullable; the redemption still links to the pending checkout or final order and remains transactionally reserved/consumed/released.

### 6. Authenticated compatibility

Authenticated cart and checkout endpoints keep their existing route paths, ownership checks, response keys, and server-side validation. The change only makes the shared service layer able to represent a guest identity.

Customer order history continues to return only orders with the authenticated user ID. Guest order lookup is token-protected and does not appear in a customer's account history until the order is associated with an account through a future explicit flow.

Admin order queries use left joins and display the guest contact snapshot when no user record exists. Customer notifications are skipped for guest orders because there is no authenticated notification owner.

### 7. Client routing and UX

- /cart becomes public.
- /checkout-success becomes public.
- A new /guest-order page lets a guest enter order ID and guest token for lookup.
- Wishlist, account, address book, notifications, and customer order history remain protected.
- Guest checkout shows email, recipient name, shipping address, city, country, and optional phone fields. Saved addresses are shown only for authenticated users.
- The success page displays the order ID, payment method, order token, and a copy action. It links guests to guest order lookup instead of /orders.
- The client clears local guest cart entries only after a successful immediate order response or after Stripe order finalization is confirmed.
- Checkout errors retain inline field/validation messaging and use transient toasts only for contextual failures.

### 8. Security and data rules

- Prices, sale prices, totals, stock, discount amounts, and user IDs are server-derived.
- Guest tokens are generated with cryptographically secure random bytes, hashed before storage, and compared by the server.
- Public lookup responses do not expose token hashes, internal user IDs, payment provider secrets, or admin notes.
- Guest order lookup uses both an order/session identifier and the token; an order ID alone is insufficient.
- Guest checkout is subject to CSRF, Zod payload limits, existing rate limits, and the same inventory reservation/idempotency rules as authenticated checkout.
- No email provider is added in this phase. The UI must not claim that a confirmation email was sent; it should show the submitted email and the token-based lookup instructions instead.

## Database changes

Create an additive Prisma/MySQL migration named 20260908100000_guest_checkout:

- Place it under server/src/database/prisma/migrations because server/prisma.config.ts points Prisma migration commands to that directory.
- Make orders.user_id nullable.
- Add nullable orders.guest_email, orders.guest_name, orders.guest_phone, and unique nullable orders.guest_order_token_hash.
- Make pending_checkouts.user_id nullable.
- Add nullable pending-checkout guest contact fields and guest_order_token_hash.
- Make discount_redemptions.user_id nullable while keeping the existing order/pending-checkout relationships.
- Add indexes needed for token lookup and guest email/admin filtering.

Existing rows remain associated with their current users. No destructive reset or production migration is part of this feature.

## Non-goals

- Cross-device guest cart synchronization.
- Automatic account creation from a guest email.
- Email delivery, marketing subscription persistence, or a new email provider.
- Guest wishlist, guest reviews, or guest account pages.
- New payment providers or changes to PayOS production activation.
- Guest cancellation/refund without authentication.
- Rewriting all existing API response shapes or replacing MySQL repositories with Prisma.

## Acceptance criteria

1. A signed-out visitor can add a product from home, catalog, or product detail and see it in /cart after refresh.
2. Guest cart storage contains only product IDs and quantities; current price and stock come from the server preview.
3. Guest preview returns authoritative product data and actionable stock/availability issues.
4. A guest can complete cash, bank transfer, PayOS, and Stripe/Card checkout with valid contact and shipping data.
5. A guest order has user_id = NULL, contact snapshots, a token hash, and the same inventory/payment/timeline behavior as an authenticated order.
6. A guest cannot retrieve an order with only its ID; order ID plus the raw token is required.
7. Stripe guest checkout survives the redirect and webhook finalization path, including mock mode.
8. Guest discounts respect existing promotion validity and usage-limit transactions.
9. Authenticated cart, checkout, order history, admin order pages, CSRF, ownership, and role checks remain intact.
10. Focused backend/frontend tests, package typechecks, builds, lint, and git diff --check pass; database migration is validated but not run against production.
