# Storefront Auth Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current photo-based Login and Signup screens with the approved Digital-E storefront auth experience while preserving Firebase Email/Password behavior, API contracts, redirects, and verification flows.

**Architecture:** Add one presentational `AuthShell` under the auth feature. Login and Signup keep ownership of validation, Firebase calls, server calls, redirects, and submission state, while the shell owns the shared storefront chrome, story panel, responsive layout, theme control, focus treatment, and shared visual tokens. Google OAuth is intentionally excluded because it is not an active runtime integration.

**Tech Stack:** React 19, TypeScript, React Router, Firebase client auth, existing theme tokens in `tailwind.css`, SCSS, Vitest + Testing Library, Playwright CLI, Firebase Auth Emulator.

## Global Constraints

- Use pnpm through the independent `client/` package; do not add dependencies or root orchestration.
- Work only on `feature/auth-storefront-redesign`; do not push or modify `main`.
- Preserve Firebase Email/Password, server session creation, `redirect` handling, `rememberMe`, email verification, and route aliases.
- Do not expose a non-functional Google OAuth control; Google OAuth was removed from the active runtime.
- Preserve accessible labels, inline field errors, first-invalid focus, 44px minimum interactive targets, visible keyboard focus, and reduced-motion behavior.
- Keep the layout usable at 320px, 390px, 768px, and desktop widths without horizontal overflow.

---

### Task 1: Establish the approved auth UI contract with failing tests

**Files:**
- Modify: `client/src/features/auth/pages/LoginPage.test.tsx`
- Modify: `client/src/features/auth/pages/SignupPage.test.tsx`

**Interfaces:**
- The tests continue to render the public `/login` and `/signup` routes and must keep the existing Firebase/API mocks.
- The new UI contract exposes an `auth-shell` root, a `Back to store` link, a `Color scheme` control, and storefront-oriented story copy.

- [ ] **Step 1: Add the Login shell assertions before implementation**

```tsx
it("renders the storefront auth shell with an explicit theme control", () => {
    render(
        <MemoryRouter initialEntries={["/login"]}>
            <Routes><Route path="/login" element={<LoginPage />} /></Routes>
        </MemoryRouter>,
    );

    expect(document.querySelector(".auth-shell")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to store" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("button", { name: /color scheme:/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
    expect(screen.getByText("Your next build starts here.")).toBeInTheDocument();
    expect(document.querySelector(".login__image")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Replace the obsolete image preload assertion**

Remove the assertion that queries `.login__image img`, because the approved redesign intentionally removes the photo panel. Keep the existing redirect, Firebase error, validation, focus, and submit-state coverage unchanged.

- [ ] **Step 3: Add the Signup shell assertions before implementation**

```tsx
it("renders the storefront signup shell without a fake social-auth affordance", () => {
    render(
        <MemoryRouter initialEntries={["/signup"]}>
            <Routes><Route path="/signup" element={<SignupPage />} /></Routes>
        </MemoryRouter>,
    );

    expect(document.querySelector(".auth-shell")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to store" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("heading", { name: "Create account" })).toBeInTheDocument();
    expect(screen.getByText("Make every build count.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /google/i })).not.toBeInTheDocument();
});
```

- [ ] **Step 4: Run the focused tests and confirm the new contract fails for the missing shell**

Run:

```powershell
pnpm --dir client exec vitest run src/features/auth/pages/LoginPage.test.tsx src/features/auth/pages/SignupPage.test.tsx --config vitest.config.ts
```

Expected: FAIL because the existing pages still render `.login__image`/`.signup__image` and do not render `.auth-shell` or the new story copy. Existing behavior assertions should remain meaningful; do not weaken them to make the test pass.

---

### Task 2: Build the shared storefront auth shell and style system

**Files:**
- Create: `client/src/features/auth/components/AuthShell.tsx`
- Create: `client/src/styles/features/auth/_auth-shell.scss`
- Modify: `client/src/styles/index.scss`

**Interfaces:**
- `AuthShell` accepts `mode: login | signup`, `titleId`, `eyebrow`, `title`, `description`, `storyTitle`, `storyDescription`, `children`, and `footer`.
- It renders `main.auth-page > div.auth-shell`, a compact Digital-E brand bar, a storefront story panel, a form panel, and a footer/legal region.
- The shell consumes `ColorSchemeToggle compact` and existing `--de-*` theme tokens; it must not introduce a second theme state.

- [ ] **Step 1: Create the typed shell component with semantic landmarks**

The component must render a text/CSS brand mark, a `Link` back to `/`, `ColorSchemeToggle compact`, an `aside` with the approved Digital-E story copy, and a `section` labelled by the supplied `titleId`. Keep the story decorative circuit element `aria-hidden=true`; keep meaningful copy as normal text.

- [ ] **Step 2: Add shared SCSS tokens and layout rules**

Use the existing storefront palette: paper/background from `--de-color-bg`, `--de-color-surface-strong` for the form surface, `--de-color-surface-inverse`/`--de-color-on-inverse` for the graphite story panel, `--de-color-signal` for the primary action, `--de-color-electric` for links/focus, and `--de-color-circuit` for the technical accent. Establish intentional type roles with `--de-font-family-display`, `--de-font-family-sans`, and `--de-font-family-mono`.

The desktop layout must use a two-column shell with a quiet form surface and one memorable circuit/story panel. The mobile layout must collapse to a compact story strip followed by the form, with no fixed-height form container or internal scroll trap. Controls and inputs must be at least 44px high, error copy must have readable line-height, and `:focus-visible` must remain obvious in both themes.

- [ ] **Step 3: Import the shell stylesheet once from `styles/index.scss`**

Add `@use ./features/auth/auth-shell;` after the existing foundation/layout imports so page components do not duplicate global auth CSS.

- [ ] **Step 4: Run the focused tests and confirm only page integration is still missing**

Run the same Login/Signup Vitest command. It should still fail on the shell assertions because the pages have not been migrated yet, while the shell stylesheet itself compiles through the test transform.

---

### Task 3: Migrate LoginPage to the shared shell without changing auth behavior

**Files:**
- Modify: `client/src/features/auth/pages/LoginPage.tsx`
- Modify: `client/src/features/auth/pages/LoginPage.test.tsx`

**Interfaces:**
- Keep `loginUser`, `signInWithFirebaseEmail`, `setFirebaseAuthPersistence`, `getSafeRedirectTarget`, `Role`, toast messages, and navigation destinations unchanged.
- Keep the public accessible names `Email`, `Password`, and `Login` so existing tests and assistive technology remain stable.

- [ ] **Step 1: Replace the photo/legacy-form JSX with semantic storefront markup**

Remove the auth image imports and responsive image calculation. Render `AuthShell mode=login` and a native `<form>` with explicit `<label>`, `<input>`, inline field alerts, `aria-invalid`, `aria-describedby`, the remember-me checkbox, Forgot password link, submit button, and Signup link. Keep `noValidate` and `aria-busy={isSubmitting}`.

- [ ] **Step 2: Preserve and refine input error clearing**

Keep first-invalid focus, but clear a field's own validation error when that field changes instead of clearing every field error. General server/Firebase errors may clear on the next edit. Do not alter the backend response interpretation or toast contract.

- [ ] **Step 3: Run LoginPage tests and confirm the page contract is green**

Run:

```powershell
pnpm --dir client exec vitest run src/features/auth/pages/LoginPage.test.tsx --config vitest.config.ts
```

Expected: all LoginPage tests pass, including redirect safety, Firebase error mapping, inline validation, first-invalid focus, and the new storefront shell assertions.

---

### Task 4: Migrate SignupPage to the shared shell without changing registration behavior

**Files:**
- Modify: `client/src/features/auth/pages/SignupPage.tsx`
- Modify: `client/src/features/auth/pages/SignupPage.test.tsx`

**Interfaces:**
- Keep Firebase account creation, existing-user fallback sign-in, ID-token registration, verification-email behavior, API error mapping, and final navigation unchanged.
- Keep public accessible names `Username`, `Email address`, `Password`, `Confirm Password`, and `Sign up`.

- [ ] **Step 1: Replace the photo/legacy-form JSX with the shared shell**

Remove the auth image imports and responsive image calculation. Render `AuthShell mode=signup` with the four existing inputs, password reveal controls, strength meter, field alerts, submit state, login link, and concise legal copy. Do not add a terms checkbox or Google button because neither is part of the current server contract.

- [ ] **Step 2: Keep password guidance aligned with validation**

Use the existing five checks and regex, but display a sentence-case helper that explicitly names lowercase, uppercase, number, and symbol requirements. Keep the `progressbar` semantics and `aria-describedby` relationships.

- [ ] **Step 3: Refine Signup error clearing without changing validation**

Clear only the edited field's validation message where possible, retain confirmation errors until the confirmation input changes, and preserve first-invalid focus and Firebase/API error messages.

- [ ] **Step 4: Run SignupPage tests and confirm the page contract is green**

Run:

```powershell
pnpm --dir client exec vitest run src/features/auth/pages/SignupPage.test.tsx --config vitest.config.ts
```

Expected: all SignupPage tests pass, including Firebase verification, validation/focus, mismatch reporting, password guidance, and the new shell/no-fake-OAuth assertions.

---

### Task 5: Document the shared auth presentation boundary

**Files:**
- Modify: `Wiki/index.md`
- Modify: `Wiki/log.md`
- Modify: `Wiki/architecture.md`

**Interfaces:**
- Documentation only; no API, schema, Firebase, or route contract changes.

- [ ] **Step 1: Add the shared auth shell to the frontend architecture notes**

Record that `/login` and `/signup` share `client/src/features/auth/components/AuthShell.tsx`, while each page retains its feature-specific Firebase/API state machine.

- [ ] **Step 2: Bump the Wiki date and append one concise log entry**

Mention the storefront auth redesign, preserved Firebase Email/Password boundary, and responsive/accessibility intent. Do not document Google OAuth as an available feature.

---

### Task 6: Verify behavior, theme, spacing, and real emulator-backed routes

**Files:**
- No additional source files unless verification reveals a defect.

- [ ] **Step 1: Run focused and package checks**

```powershell
pnpm --dir client exec vitest run src/features/auth/pages/LoginPage.test.tsx src/features/auth/pages/SignupPage.test.tsx --config vitest.config.ts
pnpm --dir client exec tsc -p tsconfig.json --noEmit
pnpm --dir client build
pnpm --dir client lint
```

- [ ] **Step 2: Ensure Firebase Auth Emulator is listening before Playwright**

Verify ports `9099` and `4001`. If they are not listening, start the local emulator with `npx firebase-tools emulators:start --only auth,ui --project demo-digital-e-local`; do not run auth browser checks against production Firebase.

- [ ] **Step 3: Run headed Playwright checks at 1440x900, 390x844, and 320x568**

Verify `/login`, `/signup`, and `/forgot-password` load; Login and Signup contain the shared shell; no horizontal overflow exists; field/button heights and visible focus are usable; theme switching updates the document theme; invalid empty submits show inline alerts and focus the first invalid field; password reveal toggles work; and loading disables the submit action without changing route behavior.

- [ ] **Step 4: Capture screenshots and inspect the final diff**

Save desktop/mobile screenshots under `output/playwright/auth-redesign/`, then review `git diff --check`, `git diff --stat`, and `git status --short`. Confirm no production secrets, emulator state, screenshots, or prototype-only files are staged.
