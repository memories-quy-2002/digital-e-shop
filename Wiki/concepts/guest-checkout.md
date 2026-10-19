# Guest checkout

Back to [[index]]. Related: [[0004-guest-cart-and-checkout]], [[architecture]].

## Flow

1. The browser keeps a versioned local cache containing only product IDs and
   quantities. When the guest cart changes, the client best-effort synchronizes
   that same non-PII shape to an anonymous server cart through an HttpOnly
   cookie.
2. The client calls `POST /api/cart/guest/preview` for the authoritative
   product, stock, promotion, and total calculation.
3. Checkout sends contact, shipping, cart identity, optional discount, and
   payment method. The server reads current data again and performs the
   transactional validation.
4. COD returns an order ID and raw token once. PayOS returns a server-created
   provider URL, order code, and token. Before redirect, the browser stores the
   token in `sessionStorage` with the payment attempt; after verified payment,
   the success page uses the token-protected attempt lookup and shows the guest
   access card.
5. The client clears the active cart after a successful COD purchase or confirmed
   PayOS finalization, then refreshes shared cart state. The success page masks
   the raw access token by default and offers explicit Reveal and Copy controls.
   If the browser session is lost, the guest can request an email OTP with the
   order ID and order email. The request response is generic, the code expires
   after ten minutes and is one-use, and successful verification rotates the
   order and guest after-sales token hashes atomically. The new token appears
   only in the verification response body.
   Authenticated checkout stores the shipping snapshot so Admin order detail
   can render the full destination; checkout can also suggest unique addresses
   from prior orders.
6. Guest lookup returns the server-calculated inclusive UTC return deadline.
   The checkout recovery email contains only the six-digit OTP and order ID;
   it does not include the guest capability token.

PayOS checkout can use the local symbolic simulator in development; that path
finalizes the reserved order without calling an external provider. Production
PayOS behavior remains behind verified webhook and reconciliation boundaries
and is not implied by the guest access model.

## Boundaries

| Concern | Guest boundary |
| --- | --- |
| Cart persistence | Versioned browser `localStorage` cache plus server `guest_carts`/`guest_cart_items` persistence keyed by an HttpOnly UUID cookie; no PII |
| Price and stock | Server preview and checkout transaction |
| Order identity | `user_id = NULL` plus validated contact snapshot |
| Secret access | Raw token in active `sessionStorage`; SHA-256 hash in the database |
| Lookup | Order ID and token together; guest-safe response only |
| Recovery | Email OTP; generic request response, one-use token rotation |
| Confirmation | Checkout-success response and protected lookup; raw token is excluded from URLs and database rows |
| Customer history | Excluded from authenticated user order history |
| Admin view | Left-joined user data with guest name/email/phone fallback |

## Cart merge

Sign-in sends one immutable guest-cart snapshot with an `operationId`. The
server locks the owner row and stores accepted increments plus the result in
one transaction. Retrying the same ID and snapshot returns the saved result;
reusing the ID with a different payload conflicts. After a partial result, the
client retains rejected quantities and starts a new operation for the next
attempt.

## Anonymous cart analytics

The active server-cart lifetime is 30 days and the server exposes only
aggregate funnel data to Admin analytics: active, active item quantity,
abandoned, converted, and expired carts. A cart is considered abandoned after
24 hours of inactivity while still containing items; empty carts are not
counted as active. Guest cart rows are not customer accounts and are not joined
to order contact information. Successful guest checkout marks the cart
converted and clears the browser cookie; local storage remains the offline
fallback if synchronization is unavailable. Expiry metadata is retained for
reporting; a separate retention cleanup job is future operational work.

See [[0004-guest-cart-and-checkout]] for the accepted access-model decision.
