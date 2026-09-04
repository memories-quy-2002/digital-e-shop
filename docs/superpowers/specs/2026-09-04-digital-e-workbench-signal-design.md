# Digital-E Workbench / Signal Design

## Goal

Replace the current cream-and-navy SCSS/React-Bootstrap visual system with a distinctive Workbench / Signal system across the public storefront, customer flows, checkout, auth, and admin UI while preserving existing routes, API contracts, and state behavior.

## Direction

Digital-E should feel like a confident electronics workbench: precise enough for comparing specifications, warm enough for everyday shopping, and visually calm enough to trust at checkout. The single signature is a compact spec rail: useful product facts such as stock, rating, warranty, and price appear as a repeated information rhythm across cards, hero panels, detail views, and admin tables.

## Visual system

- Canvas: graphite `#111416` for high-attention shells and hero surfaces.
- Panel: mineral charcoal `#1C2429` and slate `#263137` for elevated surfaces.
- Reading surface: mineral paper `#E7E3DA` for catalog/detail content where product imagery needs contrast.
- Primary action: copper signal `#E4663D`; use dark ink text on copper controls.
- Interactive accent: electric blue `#4C8DFF`; reserve for links, focus, and selected controls.
- Positive state: circuit mint `#B6D546`; pair with dark text and a visible text label.
- Body text: ink `#14191D` on reading surfaces and bone `#F2EFE9` on graphite surfaces.
- Typography: Exo for display and section headings, Nunito Sans for body/UI copy, Roboto Mono for specs, labels, prices, and operational metadata.
- Shape: 6-10px panel corners, no pill-shaped containers except statuses and compact filters.
- Depth: one restrained shadow layer plus borders; no neumorphism, glass blur, or decorative gradients.
- Motion: 180-260ms transitions, small translate/opacity reveals only, with `prefers-reduced-motion` disabling nonessential motion.

## Structure

- Public header: brand, primary route navigation, prominent search, wishlist/cart/account actions; mobile navigation uses a shadcn-style Sheet.
- Homepage: signal hero, category/workbench shortcuts, featured product rail, product grid, recently-viewed strip, and a concise service footer.
- Catalog: editorial intro, result summary, sticky desktop filter rail, mobile filter Sheet, clear active-filter chips, sort toolbar, product grid, pagination, and intentional empty/error states.
- Product detail: asymmetric gallery and purchase summary, spec rail, quantity and purchase actions, tabbed description/reviews, and recommended products.
- Customer/auth/cart: the same graphite/paper surfaces, visible form labels, focused action hierarchy, and clear totals/status messaging.
- Admin: dense charcoal shell with shadcn-style Sidebar, cards, tables, filters, dialogs, and chart surfaces; preserve the current admin routes and authorization wrappers.

## Technical boundaries

- Tailwind becomes the primary styling layer through the Vite Tailwind plugin and CSS theme variables.
- Add a small `client/src/components/ui/` primitive set based on shadcn conventions: Button, Badge, Card, Sheet, Dialog, Input, Select, Tabs, Separator, Skeleton, and Table as needed.
- Preserve React contexts, Axios helpers, route paths, product/image helpers, and existing API response shapes.
- Remove React-Bootstrap imports, dependency, and dedicated Vite chunking. Existing SCSS files may remain temporarily for untouched legacy selectors, but new and migrated surfaces use Tailwind classes and shared UI primitives.
- No server or database changes are part of this redesign.

## Accessibility and responsive requirements

- All interactive controls retain visible keyboard focus and accessible names.
- Normal text maintains at least 4.5:1 contrast; status meaning is never conveyed by color alone.
- Touch targets are at least 44x44px with 8px minimum spacing.
- Layouts are mobile-first at 375px, then enhanced at 768px, 1024px, and 1440px without horizontal scrolling.
- Images reserve layout space, use descriptive alt text for meaningful content, and retain an intentional fallback when remote product imagery fails.
- Loading, empty, error, and success states are explicit and announced where appropriate.

## Out of scope

- Rewriting backend services, auth/session mechanics, product data, or database schemas.
- Fixing deployed data/image configuration unless the frontend needs a safe fallback to make the redesign usable.
- Adding a new design dependency when an existing primitive or browser capability is sufficient.
