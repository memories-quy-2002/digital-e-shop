# Storefront customer journey

This guide describes the current customer-facing purchase path. It documents
implemented behavior; conversion impact is not measured unless an experiment
or analytics report is cited separately.

## Purchase path

On small screens the product page offers a second purchase control after the
primary button scrolls above the viewport. Both buttons use the same quantity,
stock checks, and cart feedback. Supported component pages also let shoppers
look up a counterpart and compare structured socket or memory standard data.
This check covers the displayed specification only. Missing or conflicting
catalog evidence is reported explicitly.

1. Browse products and add items as a guest or signed-in customer.
2. Review products, adjust quantities, and apply a discount in the cart.
3. Continue to checkout. The cart is validated by the server first; a valid
   cart opens checkout directly without a second subtotal-only review dialog.
4. Enter contact and delivery details, request a delivery quote, then choose
   PayOS or cash on delivery. Signed-in customers can reuse saved/recent
   addresses and eligible loyalty points.
5. Review the quoted shipping fee and payable total in the checkout summary
   before placing the order.
6. Follow the payment result and order status from the checkout confirmation
   flow. PayOS completion is based on verified server-side payment state.

Checkout shows a three-step progress indicator: cart complete, delivery and
payment current, and order confirmation next. The completed cart step returns
customers to the cart. The checkout form remains one page, so the indicator
describes journey position rather than a multi-page wizard.

## Recovery behavior

- Cart load failures offer a retry action.
- Stock or availability changes are shown in the cart and block checkout until
  the customer resolves them.
- Checkout retains its recoverable validation messages and asks for a fresh
  delivery quote when relevant cart, price, or address details become stale.
- Checkout drafts are used for supported payment-return recovery; payment
  attempts and order state remain server-authoritative.

## Journey measurement

- Search empty rate uses empty results divided by all recorded successful
  searches with a keyword. Page and sort changes keep the same search identity.
- Cart validation and checkout submission are separate event series. Divide
  blocked attempts by all recorded attempts in the same series. Break blocked
  attempts down by the bounded reason field.
- A successful retry in the same mounted flow carries `recovered: true` after
  a block. This counts recoveries, while a user-level abandonment rate would
  require an additional session model. An accepted PayOS session does not
  establish that payment settled.
- Event properties omit search text and customer identifiers. The Analytics
  hook strips query strings and fragments from event URLs.

## Local review

The 2026-11-08 Playwright review used a local Vite storefront with intercepted
catalog, product, and guest-cart API responses. It covered 390 × 844 mobile
flows and a 1440 × 900 product page, English and Vietnamese copy, the system
dark appearance, product add-to-cart, out-of-stock disabling, no-result search
and filter removal, the mobile sticky purchase control, and a CPU/motherboard
compatibility lookup. No order or external payment was created. These fixtures
verify presentation and client interactions only; they do not verify database
state, authoritative cart totals, delivery quotes, payment state, persistence,
or analytics delivery.

The local API process started, but catalog requests could not reach MySQL at
`127.0.0.1:3307` (`ECONNREFUSED`). Therefore real API/browser acceptance is
pending. The desktop product page rendered without horizontal overflow at
1440px, and the reviewed mobile routes rendered without horizontal overflow at
390px. An explicit light-theme browser pass, keyboard-only review, and a real
database checkout remain unverified. MySQL 8.0 integration coverage exercises
Vietnamese search terms, compact and spaced model aliases, exact SKU precedence,
category filters, and count/list parity; those tests were not rerun as part of
this browser session.

The focused client checks for guest cart entry points and product-card
accessible names passed (11/11 and 10/10 respectively), as did client
TypeScript checking. Use the cart and checkout component tests for validation
gates and progress labels. Do not create real orders or initiate external
payment during visual review.

Related references: [Testing](TESTING.md), [Development](DEVELOPMENT.md), and
the Wiki's [commerce journey](../Wiki/synthesis/commerce-journey.md).
