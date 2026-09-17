---
contentType: Conceptual
goal: Explain how Digital-E stores and uses product data
audience: Maintainers and AI agents
contentPlan: Identity, pricing, inventory, relations, and invariants
openQuestions: Should categories and brands become documented first-class entities?
---

Back to [[index]]

# How product data stays consistent

TL;DR: A product is the catalog identity used by browsing, carts, checkout, inventory, reviews, and order history. Current product data can change, but an order keeps the values that the customer saw at checkout.

## Product identity

The `products` table gives each product an auto-incremented `id` and a unique
`sku`. The record also stores the name, description, main image,
manufacturer part number, warranty duration, category, brand, specifications,
price, sale price, stock, and timestamps.

`manufacturer_part_number` supports supplier or manufacturer lookup. `sku`
identifies the store item and remains stable after an order is created. The
current runtime uses exact whole-number VND for new catalog and checkout
amounts, even though legacy decimal columns remain in the schema.

## Product relationships

Product data participates in these relationships:

- `ProductAttribute` stores typed filterable attributes and enforces one
  attribute key per product
- `CartItem` and `GuestCartItem` reference the current product for cart display
- `InventoryReservation` references the product during a pending checkout
- `InventoryMovement` records sales and manual stock adjustments
- `OrderItem` references the product while also storing an order snapshot
- `Review` references the product and a customer

The product record is current-state data. It is not the historical source for
an old order, because catalog edits must not rewrite the customer's receipt.

## Invariants and write boundaries

The server owns price and stock validation during guest preview and checkout.
The client may display a local cart value, but checkout recalculates the
authoritative amount.

Checkout reserves inventory before payment completion. A successful order
creates inventory movements, while a pending-order cancellation restores
inventory once. Product deletion keeps the existing soft-delete behavior.

`OrderItem` snapshots preserve SKU, product name, image, unit price, brand,
category, warranty, specifications, and quantity. See [[order]] for the
historical boundary and [[checkout-and-payment-runtime]] for the write flow.

## Source trail

The primary implementation lives in `server/src/products/`, product
attributes live in `server/src/products/product-attributes.*`, and the
persistence models live in `server/src/database/prisma/schema.prisma`.
