# Checkout UI and Email Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refresh the Checkout page as a dark technical/electronics flow and make email validation resilient to normal addresses and surrounding whitespace.

**Architecture:** Keep checkout behavior inside the existing orders feature. Extract the small email/form validation rules into a feature-local pure module so the regression is testable without mounting the full authenticated checkout. Keep the existing Checkout component, route, API endpoints, payment methods, and session-storage contracts. Add only a later scoped Checkout SCSS refresh block in the existing orders stylesheet so Cart styles remain untouched.

**Tech Stack:** React 19, TypeScript, Vite, legacy form wrappers backed by Tailwind utility classes, SCSS, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-07-checkout-ui-and-email-validation-design.md`

## Global constraints

- Work only in the client Checkout feature and the two approved design documents.
- Preserve unrelated dirty worktree changes.
- Use existing Digital-E CSS tokens; do not introduce a new dependency or a second design system.
- Preserve API payload keys, route paths, auth/CSRF behavior, Stripe redirect behavior, PayOS symbolic behavior, and cart stock validation.
- Do not store or log secrets or unmasked phone data.
- Use `pnpm` commands from the owning `client/` package for verification.

## Task 1: Add regression-tested checkout validation helpers

**Files:**

- Add `client/src/features/orders/checkoutValidation.test.ts`
- Add `client/src/features/orders/checkoutValidation.ts`

1. Write tests first for:

```ts
describe("checkout email validation", () => {
    it("accepts trimmed plus-addressed emails with long TLDs", () => {
        expect(validateCheckoutEmail("  user+shop@example.travel  ")).toBeNull();
    });

    it("rejects malformed email values", () => {
        expect(validateCheckoutEmail("invalid-email")).toBe("Invalid email format");
    });
});
```

2. Run the focused test and observe the expected missing-module failure if the test runner is available.
3. Implement `normalizeCheckoutEmail(email: string)` with `trim()` and `validateCheckoutEmail(email: string): string | null` using a readable shape check that rejects whitespace and missing domain suffixes without limiting TLD length.
4. Add `validateCheckoutForm` for the existing required Checkout fields, preserving the current user-facing messages and payment-method requirement.
5. Run the focused test again and confirm the helper tests pass or record the environment failure separately.

## Task 2: Integrate normalized validation into Checkout

**File:** `client/src/features/orders/components/CheckoutPaymentPage.tsx`

1. Import the feature-local helper functions and remove the inline restricted regex.
2. Track whether the email field has been touched, set it on blur and submission, and expose `aria-invalid`/`aria-describedby` when invalid.
3. Render the inline email error only after blur/submit while retaining the existing aggregate checkout error behavior.
4. Use functional state updates in `handleInputChange` so rapid edits cannot use stale form state.
5. Use the normalized email in `checkoutPending` and the checkout-success route state while leaving request payload keys and endpoints unchanged.
6. Keep saved-address population, cart revalidation, payment selection, Stripe redirect, PayOS text, and success navigation behavior intact.

## Task 3: Implement the approved dark technical Checkout UI

**File:** `client/src/styles/features/orders/_cart.scss`

1. Add a later, scoped `.checkout` refresh block after the existing Checkout rules; leave `.cart`, `.cart-item`, and other order styles unchanged.
2. Add a compact header with a technical eyebrow, explicit `Cart → Shipping → Payment` progress rail, back-to-cart action, item count, and total due.
3. Restyle cards, labels, inputs, saved-address buttons, payment method cards, selected payment details, notices, summary rows, and primary action with dark tokens.
4. Use electric blue for focus/active navigation, circuit lime for selection/status, signal orange for the primary CTA, and danger/warning tokens for errors.
5. Add visible `:focus-visible` treatment, minimum touch-friendly control heights, mobile breakpoints, and reduced-motion handling.
6. Preserve existing class names used by the JSX while adding only small semantic classes required for progress and inline email feedback.

## Task 4: Verify and review

1. Run:

```powershell
pnpm --dir client exec vitest run src/features/orders/checkoutValidation.test.ts
pnpm --dir client exec tsc -p tsconfig.json --noEmit
pnpm --dir client lint
pnpm --dir client build
git diff --check
```

2. Review the diff for accidental changes outside Checkout, API contract changes, unmasked sensitive data, and light-theme regressions.
3. Report command results exactly, including any Windows/Vite environment blockers.
