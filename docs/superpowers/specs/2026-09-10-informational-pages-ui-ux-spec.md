# Informational Pages UI/UX Remediation

## Goal

Make the public Contact, Support, and News pages truthful, actionable, localized, and keyboard-accessible without changing the support-ticket API contract or introducing a visual redesign.

## Scope and order

Implement in this order:

1. Contact: make the authenticated ticket flow explicit for guests, preserve the user's draft through sign-in, and turn direct contact details into actions.
2. Support: replace hardcoded English copy, correct the misleading live-chat affordance, make self-service topics actionable, and repair FAQ semantics.
3. News: give every story a real reading path, add a detail route, and format dates for the active locale.

## Decisions

- `POST /api/support/tickets` remains protected by the existing customer/admin guards. The Contact page must not call it for an anonymous visitor.
- An anonymous Contact submission stores only the current form draft in session storage, shows a localized sign-in explanation, and redirects to `/login?redirect=/contact-us`. Returning to Contact restores the draft; a successful submission clears it.
- The existing “Live chat” card is renamed to a truthful “Contact form” action because it currently links to `/contact-us` and there is no chat transport.
- Support resource cards become links to existing destinations (`/orders` for order tracking and `/contact-us` for topics that need an agent). No new backend support knowledge base is added.
- News remains static content, but each story gets a stable slug and a client-side detail route at `/news/:slug`. No fabricated API or CMS integration is introduced.
- Existing visual language, responsive layout, API helpers, auth/CSRF behavior, and unrelated worktree changes are preserved.

## Acceptance criteria

### Contact

- An authenticated visitor can submit using the existing `createSupportTicket` helper and sees the existing success toast.
- An anonymous visitor's submit does not call `createSupportTicket`; the draft is preserved and the visitor is sent to sign-in with a safe same-origin redirect.
- Returning to Contact restores a valid draft, while successful submission clears it.
- Email and phone details use `mailto:` and `tel:` links.
- Contact loading/error/guest copy is localized in English and Vietnamese; no user-facing hardcoded English remains in the changed Contact flow.

### Support

- Page title, hero, channels, resources, and FAQ copy switch with the existing locale provider.
- The contact-form channel label and CTA describe the actual destination.
- Every resource card has a clear keyboard-focusable link.
- FAQ controls expose `aria-expanded` and `aria-controls`; the answer is a labelled region and no block element is nested inside a button.

### News

- Featured content and every article card expose a visible localized “Read article” action.
- Each action opens the matching `/news/:slug` detail page; invalid slugs render the existing not-found experience.
- Article dates use the active `en`/`vi` locale instead of a hardcoded `en-GB` formatter.
- The detail page is responsive and provides a clear return path to News.

## Verification

- Focused Vitest/Testing Library coverage for guest Contact behavior, Support affordances/FAQ semantics, and News links/detail data.
- Client typecheck, tests, build, and lint as available.
- Playwright browser verification at 1920x1080 plus a mobile viewport for `/contact-us`, `/support`, `/news`, and a News detail route, including the guest Contact redirect and keyboard-visible actions.
