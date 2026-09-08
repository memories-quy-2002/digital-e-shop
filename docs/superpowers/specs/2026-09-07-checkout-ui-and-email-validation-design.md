# Checkout UI and Email Validation Design

## Goal

Make the Checkout flow feel consistent with Digital-E's dark technical/electronics identity and remove false `Invalid email format` failures without changing checkout or payment API contracts.

## Approved visual direction

- Charcoal/graphite page and panel surfaces with the existing Digital-E tokens.
- Electric blue for informational and active navigation states.
- Circuit lime for confirmed/selected states and small status accents.
- Signal orange for the primary `Place order` action.
- Compact technical labels and a restrained circuit/rail motif; no decorative clutter.
- Clear desktop hierarchy: checkout progress and context at the top, shipping/contact and payment on the left, order summary on the right.
- Single-column mobile layout with the order summary after the form and touch-friendly controls.

## Behavior

- Normalize the email with `trim()` before validation and before writing checkout success/pending session data.
- Accept common valid addresses such as `user+shop@example.travel`.
- Reject empty values and addresses without a local part, `@`, or a domain suffix.
- Keep validation errors visible in the existing checkout error region and add an inline email error after the field has been touched or checkout submission has been attempted.
- Preserve auth, cart validation, CSRF, payment-method selection, Stripe redirect, PayOS symbolic flow, and existing API payload shapes.

## Acceptance criteria

1. Checkout is visibly dark and uses only the existing Digital-E color tokens in its primary surfaces, controls, accents, and focus states.
2. The checkout header communicates `Cart`, `Shipping`, and `Payment`, with Payment marked active.
3. Email values with surrounding whitespace and plus-addressing pass client validation; malformed values show a clear inline error.
4. The layout remains usable at mobile widths, including payment options, saved addresses, form fields, summary, and the primary action.
5. The email validation logic has focused regression tests.
6. Existing checkout request and navigation behavior remains unchanged.
