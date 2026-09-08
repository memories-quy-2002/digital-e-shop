# Guest checkout

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
5. The client clears the guest cart only after successful purchase or confirmed
   Stripe finalization, then refreshes shared cart state.

## Boundaries

| Concern | Guest boundary |
| --- | --- |
| Cart persistence | Browser `localStorage`, product ID and quantity only |
| Price and stock | Server preview and checkout transaction |
| Order identity | `user_id = NULL` plus validated contact snapshot |
| Secret access | Raw token in active `sessionStorage`; SHA-256 hash in the database |
| Lookup | Order ID and token together; guest-safe response only |
| Customer history | Excluded from authenticated user order history |
| Admin view | Left-joined user data with guest name/email/phone fallback |

See [[0004-guest-cart-and-checkout]] for the accepted access-model decision.
