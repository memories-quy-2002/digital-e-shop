# Guest checkout

Back to [[index]]. Related: [[0004-guest-cart-and-checkout]], [[architecture]].

## Flow

1. The browser stores only product IDs and quantities in the versioned guest
   cart key.
2. The client calls `POST /api/cart/guest/preview` for the authoritative
   product, stock, promotion, and total calculation.
3. Checkout sends contact, shipping, cart identity, optional discount, and
   payment method. The server reads current data again and performs the
   transactional validation.
4. Immediate methods return an order ID and raw token once. Card checkout
   returns the provider URL and token; the success page uses the token-protected
   session lookup after redirect.
5. The client clears the active cart after a successful purchase or confirmed
   Stripe finalization, then refreshes shared cart state. The success page masks
   the raw access token by default and offers explicit Reveal and Copy controls.
   Authenticated checkout stores the shipping snapshot so Admin order detail
   can render the full destination; checkout can also suggest unique addresses
   from prior orders.
6. The current runtime does not send an external order email after the
   immediate order transaction or Stripe finalization commits. Guests receive
   the checkout-success response and protected lookup remains available;
   authenticated customers receive database-backed in-app order notifications.

Immediate checkout can use the local symbolic provider path in development;
that path finalizes the reserved order without calling Stripe. Production
payment-provider behavior remains behind the payment boundary and is not
implied by the guest access model.

## Boundaries

| Concern | Guest boundary |
| --- | --- |
| Cart persistence | Browser `localStorage`, product ID and quantity only |
| Price and stock | Server preview and checkout transaction |
| Order identity | `user_id = NULL` plus validated contact snapshot |
| Secret access | Raw token in active `sessionStorage`; SHA-256 hash in the database |
| Lookup | Order ID and token together; guest-safe response only |
| Confirmation | Checkout-success response and protected lookup; raw token is excluded from URLs and database rows |
| Customer history | Excluded from authenticated user order history |
| Admin view | Left-joined user data with guest name/email/phone fallback |

See [[0004-guest-cart-and-checkout]] for the accepted access-model decision.
