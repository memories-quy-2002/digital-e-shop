# Informational Pages Full-Bleed Hero Design

## Status

User-approved direction — pending written-spec review, 2026-09-15.

## Context

The public About, News, Contact, and Support pages already share an
info-page style layer, but their hero sections currently use different
layouts, heights, radii, overlays, and image treatments. Contact has no hero
image, while Support and Contact reserve more vertical space than their copy
needs.

The existing visual identity must remain the Digital-E Workbench / Signal
system: semantic --de-* tokens, graphite/inverse hero surfaces, mineral
reading surfaces, Electric Blue informational states, Signal primary actions,
and the existing display/body/mono font roles.

## Goal

Give all four pages one deliberate image-led visual language while reducing
unused Hero space on Contact and Support. Preserve the current copy, routes,
localized dictionaries, support-ticket behavior, news detail route, and
responsive accessibility.

## Approved visual direction

Each page will use a full-bleed image Hero with the same visual contract:

- an image layer that fills the Hero with object-fit: cover;
- a token-derived directional overlay that protects text contrast;
- content aligned toward the lower-left rather than vertically centered in a
  tall empty frame;
- one shared border, radius, action treatment, and focus treatment;
- optional lower rail content inside the Hero for News ticker and Contact
  response/channel stats.

Existing assets will be reused:

| Page | Hero asset | Treatment |
| --- | --- | --- |
| About | about_us.jpg | Lower-left story copy over the image |
| News | news_2.jpg | Lower-left editorial copy with ticker rail |
| Contact | background_form.jpg | Lower-left contact copy with stats rail |
| Support | support.jpg | Lower-left support copy and actions |

The images remain decorative (alt="" and aria-hidden="true"), because the
Hero copy carries the meaning. Responsive srcSet handling remains in place.
Page-specific focal positions may differ so important image content is not
hidden by the overlay or copy.

## Shared style contract

client/src/styles/pages/_informational.scss will own the common
info-page__hero rules. The four page styles will only define page-specific
layout details such as image focal position, optional rail arrangement, and
copy width.

The shared Hero target is a compact responsive surface: roughly
clamp(340px, 36vw, 440px) on larger screens and content-driven sizing on
small screens. The exact values will follow the existing breakpoints and be
validated at desktop and mobile widths. The previous 470–520px minimum-height
behavior will not be retained for Contact or Support.

The shared layer will also align:

- Hero border/radius with existing semantic radius tokens;
- Hero copy, badge/eyebrow, CTA, and ghost-button spacing;
- overlay opacity and border colors through --de-*/color-mix;
- section rhythm, panel radius, border, and shadow treatment below the Hero.

No page-specific hard-coded theme colors or new dependencies will be added.

## Markup changes

- About will move its existing image from the split media column into the
  shared full-bleed Hero image layer.
- News and Support will keep their existing decorative image elements and add
  the shared Hero class contract.
- Contact will import background_form.jpg and add it as the decorative Hero
  image layer.
- Contact stats and News ticker will remain localized and become optional
  shared-style Hero rails; no data or copy changes are part of this design.

No new React abstraction is required; shared class names and existing page
components are sufficient for this four-page visual pass.

## Responsive and accessibility behavior

- At desktop widths, content remains readable over the directional overlay and
  optional rails use the available lower/right space without increasing Hero
  height unnecessarily.
- At mobile widths, content padding decreases, actions stack when needed, and
  stats/ticker content becomes a wrapping grid with no horizontal overflow.
- All interactive Hero links retain visible keyboard focus and the existing
  minimum touch target conventions.
- prefers-reduced-motion behavior remains unchanged because this pass adds no
  required animation.

## Scope boundaries

In scope:

- the four page components where image-layer markup or class names must change;
- _informational.scss, _about.scss, _news.scss, and _contact.scss;
- _support.scss and focused style/test assertions if the shared contract
  requires them;
- responsive visual verification for the four routes.

Out of scope:

- News API, CMS, real-time feed, or backend changes;
- copy, localization, route, auth, CSRF, or support-ticket contract changes;
- new image generation, new dependencies, or unrelated storefront/admin
  redesign;
- staging or modifying existing auth, content, server, or Wiki worktree files.

## Verification

Run the relevant client checks after implementation:

1. pnpm --dir client exec tsc -p tsconfig.json --noEmit
2. Focused informational-page Vitest tests.
3. pnpm --dir client build
4. pnpm --dir client lint
5. pnpm --dir client test -- --run
6. Browser verification at desktop and mobile widths for
   /about-us, /news, /contact-us, and /support, checking Hero height,
   image crop, contrast, focus visibility, and horizontal overflow.
