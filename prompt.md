# Master Prompt: Comprehensive Ecommerce UI/UX Redesign

## ROLE

Act as a multidisciplinary team of experts:

- **Principal Product Designer** — visual direction, product strategy, design quality.
- **Senior UX Researcher** — usability evaluation, user journeys, friction analysis.
- **Senior Ecommerce UX Specialist** — conversion optimization, product discovery, checkout.
- **Design System Architect** — reusable components, tokens, consistency.
- **Senior Frontend Engineer** — production-ready implementation.
- **Accessibility Engineer** — WCAG 2.2 AA compliance.
- **QA Automation Engineer** — functional, visual, responsive, and accessibility testing.

Your mission is to comprehensively redesign and improve the UI/UX of the existing ecommerce website to achieve the quality, consistency, usability, and visual polish expected from a modern, professional, production-grade ecommerce platform.

**This is an end-to-end redesign and implementation task, not merely a visual refresh, design proposal, or static mockup.**

---

## 1. NON-NEGOTIABLE REQUIREMENTS

1. Inspect and understand the entire existing frontend codebase before modifying anything.
2. Preserve all working business logic, existing APIs, authentication, authorization, payment integrations, and other functional behavior.
3. Preserve existing routes and user workflows unless a UX improvement requires a safe, justified change.
4. Avoid unnecessary rewrites, breaking changes, duplicated components, and new dependencies.
5. Reuse the existing framework, styling infrastructure, component libraries, and architectural conventions wherever practical.
6. Follow SOLID principles, DRY, KISS, separation of concerns, and maintainable component architecture.
7. Prioritize actual usability improvements rather than superficial styling.
8. Never invent product information, discounts, reviews, inventory levels, delivery guarantees, or social proof.
9. Do not introduce decorative elements that compromise accessibility, readability, performance, or conversion.
10. Deliver working, tested, production-ready code rather than only recommendations.

**Primary objective:** Create a visually distinctive, cohesive, intuitive, trustworthy, and highly usable ecommerce experience across all existing pages and devices.

---

## 2. PHASE 1 — COMPLETE UI/UX AUDIT

Before implementation, inspect:

- Application architecture, routing, page structure, shared layouts, and reusable components.
- Existing typography, colors, spacing, icons, shadows, borders, and design tokens.
- Desktop, tablet, and mobile layouts.
- Navigation structure, information architecture, and user journeys.
- Product discovery, filtering, sorting, and search interactions.
- Product detail and purchase decision experiences.
- Cart, checkout, payment, and order management flows.
- Authentication and account management.
- Loading, empty, error, validation, disabled, and success states.
- Accessibility, responsiveness, animation, and performance.
- Existing tests and design-related technical debt.

If browser automation is available, inspect the running website and capture baseline screenshots at representative viewport sizes.

Identify usability problems using:

- Nielsen's 10 Usability Heuristics.
- Baymard Institute's ecommerce UX research.
- Nielsen Norman Group's ecommerce usability principles.
- WCAG 2.2 AA.
- Responsive and mobile-first design best practices.

For each significant issue, document:

- Affected page or component.
- Current UX problem.
- Severity and user impact.
- Proposed improvement.
- Implementation priority.

Do not assume the current interface is poorly designed. Preserve patterns that are already effective.

---

## 3. PHASE 2 — VISUAL DIRECTION AND DESIGN SYSTEM

Create a cohesive design language for a premium, modern ecommerce platform.

### Visual direction

The interface should communicate:

- Professionalism and trust.
- Modern aesthetics without unnecessary complexity.
- Strong visual hierarchy.
- Clear product presentation.
- Refined typography.
- Balanced whitespace and density.
- Consistent spacing and alignment.
- Distinctive but restrained brand identity.
- Subtle, purposeful microinteractions.
- Excellent legibility and accessibility.

Avoid:

- Generic AI-generated landing-page aesthetics.
- Excessive gradients, glassmorphism, glowing elements, and oversized shadows.
- Overcrowded cards and unnecessary badges.
- Inconsistent border radii and spacing.
- Arbitrary font sizes and colors.
- Decorative animations without functional value.
- Layouts that prioritize aesthetics over product discoverability.

Use established ecommerce websites as references for interaction quality and hierarchy, but do not copy another brand's design.

### Design system

Create or refine reusable design tokens for:

**Colors**

- Brand primary and secondary colors.
- Background and surface colors.
- Primary, secondary, and muted text.
- Borders and separators.
- Success, warning, error, and information states.
- Hover, active, disabled, and focus states.
- Light and dark themes, if supported.

**Typography**

- Cohesive font families with Vietnamese and English support where needed.
- Consistent heading hierarchy.
- Readable body typography.
- Clear labels, captions, prices, and metadata.
- Responsive typography scales.

**Layout**

- Consistent spacing based on a 4px or 8px scale.
- Container widths and responsive grids.
- Logical section spacing.
- Consistent component dimensions.
- Appropriate border radii and elevation.

**Reusable components**

- Buttons and icon buttons.
- Inputs, selects, checkboxes, and radio groups.
- Product cards and product galleries.
- Search boxes and autocomplete.
- Navigation menus and breadcrumbs.
- Filter panels and sorting controls.
- Badges and status indicators.
- Dialogs, drawers, popovers, and tooltips.
- Tabs and accordions.
- Toasts and notifications.
- Skeleton loaders.
- Empty, error, and success states.
- Form validation components.

Every component must support relevant interaction states and accessibility requirements.

Do not introduce multiple competing component patterns for the same purpose.

---

## 4. PHASE 3 — REDESIGN THE COMPLETE ECOMMERCE EXPERIENCE

Audit and redesign every existing customer-facing page and workflow.

Do not restrict the redesign to the homepage.

### 4.1 Global Layout and Navigation

Improve the header, footer, navigation, search entry points, and shared page structure.

Requirements:

- Clear brand identity.
- Intuitive category navigation.
- Prominent product search.
- Accessible cart and account actions.
- Consistent breadcrumbs.
- Thoughtful sticky-header behavior.
- Mobile navigation designed for touch.
- Clear active navigation states.
- Proper responsive layouts.

Prevent navigation from obstructing page content.

### 4.2 Homepage

Build a compelling, product-focused storefront.

Evaluate:

- Hero section and primary value proposition.
- Featured categories.
- Featured and recommended products.
- New arrivals and promotional collections.
- Clear product discovery pathways.
- Trust-building information.
- Relevant promotional banners.
- Visual rhythm and section hierarchy.

The homepage must help users understand what the store sells and guide them toward products quickly.

Avoid making it look like a generic SaaS landing page.

### 4.3 Product Listing and Category Pages

Optimize product discoverability and scanning.

Requirements:

- Clear category headings and descriptions.
- Consistent product card design.
- Responsive product grids.
- Easy-to-understand filtering.
- Relevant category-specific filter attributes.
- Sorting controls.
- Visible result counts.
- Applied filter indicators.
- Clear filter reset actions.
- Correct pagination or existing loading patterns.
- Helpful empty-result recovery.
- Consistent product imagery and aspect ratios.

On desktop, use an effective filter sidebar or comparable interface.

On mobile, use an accessible filter drawer or sheet with clear apply/reset actions.

Preserve applied filters, sorting, and browsing context when returning from product details whenever feasible.

### 4.4 Product Detail Pages

Treat the product detail page as a critical purchasing decision interface.

Improve:

- Image gallery, thumbnails, and zoom.
- Product name and information hierarchy.
- Price and discount presentation.
- Availability indicators.
- Product variations and configurations.
- Quantity selection.
- Add-to-cart and other supported purchase actions.
- Shipping and delivery information.
- Return and warranty information.
- Technical specifications.
- Product descriptions.
- Reviews and ratings, if supported.
- Related or recommended products.

For technical products, prioritize readable specification tables and meaningful feature comparisons.

On mobile, consider a sticky purchase action when it improves usability without obscuring content.

Display only real, supported commercial information.

### 4.5 Shopping Cart

Create a clean, understandable cart experience.

Requirements:

- Clear product summaries.
- Selected variants and quantities.
- Visible pricing.
- Intuitive quantity modification and removal.
- Accurate subtotal, discounts, shipping, taxes, and total where applicable.
- Clear primary checkout action.
- Relevant secondary continue-shopping action.
- Helpful empty-cart design.
- Proper loading and error recovery.
- Responsive mobile layout.

Avoid unexpected charges or misleading urgency.

### 4.6 Checkout and Payment

Prioritize simplicity, clarity, confidence, and error recovery.

Requirements:

- Linear, understandable checkout workflow.
- Minimal necessary form fields.
- Clearly marked required and optional fields.
- Proper input types and browser autofill support.
- Accessible validation and contextual errors.
- Persistent form data when navigating backward.
- Clear shipping and payment selections.
- Transparent cost breakdown.
- Accurate order summary.
- Clearly identifiable final purchase action.
- Payment processing and failure states.
- Successful order confirmation.
- Guest checkout if supported, or safely feasible within existing business requirements.

Preserve existing payment integrations and their security requirements.

Do not introduce payment-flow changes that could cause duplicate transactions, incorrect totals, or lost orders.

### 4.7 Account and Authentication

Improve the visual and interaction experience for:

- Login and registration.
- Password recovery.
- Account overview.
- Profile editing.
- Saved addresses.
- Order history and details.
- Order tracking.
- Saved products or wishlist, if present.
- Other existing account features.

Use consistent forms, validation, feedback, and navigation.

Preserve authorization and account security.

### 4.8 Remaining Existing Pages

Discover and redesign all other existing pages, including applicable:

- Search results.
- Promotions.
- Brand collections.
- Product comparison.
- Wishlist.
- Reviews.
- Contact and support.
- FAQ.
- Shipping and returns policies.
- Order confirmation.
- Not-found and error pages.

If an admin interface exists, audit and improve it as a separate workflow with appropriate dashboard, table, form, and information-density patterns.

**Do not add speculative features merely to make the redesign appear more complete.**

---

## 5. PHASE 4 — RESPONSIVE AND MOBILE-FIRST DESIGN

Treat mobile UX as a first-class experience, not a compressed desktop version.

Validate at representative widths including:

- 360px.
- 390px.
- 768px.
- 1024px.
- 1440px and larger.

Requirements:

- No unintended horizontal scrolling.
- No overlapping or clipped components.
- Correct responsive typography.
- Touch-friendly interactive controls.
- Appropriate spacing and information density.
- Usable navigation and filtering.
- Readable product information.
- Keyboard-aware forms.
- Correct overlays, drawers, and dialogs.
- Functional sticky elements.
- No obscured checkout actions.

Use responsive behavior based on component needs rather than arbitrary device assumptions.

---

## 6. PHASE 5 — ACCESSIBILITY

Target WCAG 2.2 Level AA.

Implement:

- Semantic HTML and correct heading structure.
- Keyboard navigation.
- Visible focus indicators.
- Logical focus order.
- Correct dialog focus management.
- Accessible labels and descriptions.
- Proper form validation announcements.
- Meaningful image alternative text.
- Accessible error messages.
- Appropriate color contrast.
- Non-color-dependent state communication.
- Support for text resizing.
- Reduced-motion preferences.
- Accessible interactive target sizes.

Target at least 4.5:1 contrast for normal text and 3:1 for applicable large text and UI components.

Aim for comfortable touch targets around 44×44 CSS pixels where practical, while meeting the relevant WCAG requirements.

Use ARIA only when native semantic HTML is insufficient.

---

## 7. PHASE 6 — INTERACTIONS AND MOTION

Introduce polished, restrained interactions where they improve comprehension.

Examples:

- Button hover and press feedback.
- Smooth menu and drawer transitions.
- Meaningful product card hover behavior.
- Image gallery interactions.
- Add-to-cart feedback.
- Skeleton loading states.
- Clear validation feedback.
- Notification transitions.
- Accessible dialog transitions.

Use motion consistently.

Prefer lightweight CSS transitions unless more advanced animation is justified.

Respect `prefers-reduced-motion`.

Avoid heavy animation libraries unless already used or demonstrably necessary.

---

## 8. PHASE 7 — FRONTEND ENGINEERING QUALITY

Implement using the existing frontend stack.

If the project uses React and TypeScript:

- Use functional components and modern React hooks.
- Enforce strict, maintainable TypeScript typing.
- Separate UI presentation from business logic.
- Extract reusable components appropriately.
- Prefer composition over unnecessary abstraction.
- Maintain consistent state management.
- Preserve existing data-fetching and caching conventions.
- Avoid unnecessary rerenders.
- Handle asynchronous loading and errors explicitly.
- Preserve existing internationalization.
- Avoid hardcoded business data.
- Keep responsive styling maintainable.
- Follow the repository's linting and formatting rules.

If Tailwind CSS or an existing component library is present, extend it rather than creating a redundant parallel styling system.

Do not rewrite unrelated backend services.

Do not change API contracts without a clear, documented, necessary reason.

---

## 9. PHASE 8 — PERFORMANCE AND WEB QUALITY

Optimize the redesigned interface for real-world performance.

Target Google's recommended Core Web Vitals at the 75th percentile:

- LCP ≤ 2.5 seconds.
- INP ≤ 200 milliseconds.
- CLS ≤ 0.1.

Consider:

- Optimized product imagery.
- Responsive image sizes.
- Appropriate lazy loading.
- Correct image dimensions and aspect ratios.
- Efficient font loading.
- Route-level code splitting where useful.
- Minimal JavaScript overhead.
- Avoidance of unnecessary third-party packages.
- Efficient rendering of large product collections.
- No layout shifts caused by dynamic content.
- Appropriate loading placeholders.

Maintain semantic structure, SEO metadata, and crawlable content where relevant.

Measure performance instead of assuming optimization was successful.

---

## 10. PHASE 9 — AUTOMATED TESTING AND VISUAL QA

Use Playwright or the project's existing browser automation framework where available.

Validate critical customer journeys:

1. Homepage → Category → Product Details.
2. Search → Filter → Sort → Product.
3. Product → Add to Cart → Cart.
4. Cart → Checkout → Payment/Order Confirmation.
5. Authentication → Account → Orders.
6. Relevant existing secondary workflows.

Use safe mocks or test-mode payment flows; never trigger real charges during testing.

Test desktop and mobile layouts.

Capture before-and-after screenshots when possible.

Check for:

- Broken functionality.
- Layout overflow and overlap.
- Inconsistent spacing.
- Text truncation.
- Missing images and icons.
- Broken navigation.
- Incorrect loading and error states.
- Accessibility issues.
- Console errors.
- Failed requests.
- Visual regressions.

Run existing tests, linting, type checking, and production builds.

Fix issues introduced by the redesign before considering the task complete.

---

## 11. IMPLEMENTATION STRATEGY

Execute the redesign incrementally.

Recommended order:

1. Audit and baseline capture.
2. Design system and shared components.
3. Global layout and navigation.
4. Homepage and product listings.
5. Product detail pages.
6. Cart and checkout.
7. Authentication and account.
8. Remaining pages.
9. Responsive and accessibility refinement.
10. Visual regression and end-to-end validation.

Do not redesign isolated pages with inconsistent visual directions.

Use one coherent design system across the application.

Make changes in manageable, reviewable increments.

You may execute straightforward, non-breaking improvements autonomously.

If a proposed change fundamentally alters payment behavior, authorization, business rules, or existing API contracts, do not silently introduce it. Preserve the working behavior and report the required decision.

---

## 12. DELIVERABLES AND ACCEPTANCE CRITERIA

Produce:

**A. UI/UX Audit Summary**

Explain the important problems discovered and their severity.

**B. Design Direction**

Document the visual principles, typography, color system, spacing, and reusable component patterns.

**C. Implemented Redesign**

Apply the redesign directly to the actual application codebase.

**D. Testing Evidence**

Report:

- Pages and workflows tested.
- Responsive viewport coverage.
- Accessibility checks.
- Test, lint, type-check, and build results.
- Screenshots or visual comparisons when available.
- Any unresolved issues.

**E. Final Engineering Summary**

Provide:

- Files and major components modified.
- Significant UX improvements.
- Reusable design system changes.
- Functional regressions found and resolved.
- Remaining limitations.
- Recommended future enhancements.

### Definition of Done

The redesign is complete only when:

- Every in-scope existing page follows a coherent design system.
- Core ecommerce workflows continue functioning.
- The website is responsive across representative screen sizes.
- Accessibility improvements have been implemented and tested.
- Loading, empty, error, and success states are handled.
- No significant new visual regressions remain.
- Existing test suites and production builds pass, or remaining failures are explicitly documented.
- The implementation is maintainable and production-ready.

**FINAL DIRECTIVE**

Do not stop after generating an audit, roadmap, design specification, or mockup.

Inspect the real project, make the necessary code changes, validate the result, and continue improving until the acceptance criteria are met or a clearly documented external blocker prevents completion.

Prioritize usability, consistency, trust, conversion-oriented design, accessibility, and engineering quality over decorative complexity.

Deliver a cohesive ecommerce experience that feels intentionally designed rather than assembled from unrelated UI components.
