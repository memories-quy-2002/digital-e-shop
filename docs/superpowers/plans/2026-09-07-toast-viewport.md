# Toast Viewport Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move transient Toasts out of the Header/page flow into an accessible, responsive global viewport optimized for desktop and mobile users.

**Architecture:** Keep `ToastProvider` as the single state owner and retain the existing `addToast`/`removeToast` contract. Render the existing Toast components through a portal into `document.body`, cap the reducer's visible queue at three items, and make the existing `.app-toast` stylesheet the fixed responsive viewport. Inline page errors remain unchanged.

**Tech Stack:** React 19, TypeScript, React Testing Library, Vitest, SCSS, existing Digital-E CSS tokens.

**Spec:** `docs/superpowers/specs/2026-09-07-toast-viewport-design.md`

## Global Constraints

- Keep the Header free of Toast markup and preserve its notification bell behavior.
- Preserve `addToast(title, body)`, tone inference, close buttons, auto-hide timing, and `aria-live="polite"`.
- Use `document.body` as the portal target and avoid adding dependencies.
- Keep no more than three visible transient Toasts.
- Use the existing Digital-E tokens and respect safe-area and reduced-motion media preferences.
- Do not move validation or checkout errors from their contextual inline surfaces.

---

### Task 1: Define the portal and queue regression tests

**Files:**

- Modify: `client/src/context/__tests__/ToastContext.test.tsx:97-122`

**Interfaces:**

- Consumes: existing `ToastProvider`, `useToast`, and `Probe` test helper.
- Produces: assertions that the viewport is portalled to `document.body` and visible Toasts are capped at three.

- [ ] **Step 1: Update the existing viewport test to assert body ownership**

Add:

```ts
expect(rails[0].parentElement).toBe(document.body);
```

Rename the test description to `keeps all notifications in one global notification rail`.

- [ ] **Step 2: Add a failing queue-cap test**

```ts
it("caps the visible notification queue at three toasts", () => {
    renderWithProvider();
    act(() => {
        screen.getByText("add-success").click();
        screen.getByText("add-info").click();
        screen.getByText("add-error").click();
        screen.getByText("add-success").click();
    });

    expect(screen.getByTestId("count").textContent).toBe("3");
    expect(document.querySelectorAll("[data-toast]")).toHaveLength(3);
});
```

- [ ] **Step 3: Run the focused test and confirm the expected RED state**

Run `pnpm --dir client exec vitest run src/context/__tests__/ToastContext.test.tsx`.

Expected: the body-parent assertion fails because the current Toast rail is rendered in the provider's normal React tree, and the queue-cap test fails because the reducer currently retains every Toast.

### Task 2: Implement the global Toast viewport behavior

**Files:**

- Modify: `client/src/context/ToastContext.tsx:1-133`

**Interfaces:**

- Consumes: `Toast`, `ToastContainer`, existing ToastContext API, and `document.body`.
- Produces: the same context API plus a portal-mounted viewport with a three-item visible queue.

- [ ] **Step 1: Add `createPortal` and define the queue cap**

Import `createPortal` from `react-dom` and define `const MAX_VISIBLE_TOASTS = 3` near the reducer.

- [ ] **Step 2: Cap only the ADD_TOAST reducer branch**

Return the latest three messages without changing removal or tone inference:

```ts
case "ADD_TOAST":
    return [...state, action.toast].slice(-MAX_VISIBLE_TOASTS);
```

- [ ] **Step 3: Portal the existing ToastContainer to `document.body`**

Keep its props and children unchanged, wrap the existing viewport element with:

```tsx
{typeof document === "undefined" ? null : createPortal(toastViewport, document.body)}
```

Render `{children}` beside the portal so the Toast rail cannot take up layout space in the app shell.

- [ ] **Step 4: Run the focused test and confirm GREEN**

Run `pnpm --dir client exec vitest run src/context/__tests__/ToastContext.test.tsx`.

Expected: all ToastContext tests pass, including body ownership and the three-item cap.

### Task 3: Style the responsive Toast viewport

**Files:**

- Modify: `client/src/styles/components/_toast.scss:1-123`

**Interfaces:**

- Consumes: `.app-toast`, `.app-toast--open`, `.app-toast__item`, existing Digital-E tokens.
- Produces: fixed desktop/mobile placement without changing Toast markup.

- [ ] **Step 1: Make the viewport fixed and independent of document flow**

Set the viewport to `position: fixed !important`, anchor it with `right` and `bottom`, remove the normal-flow margin, and keep `pointer-events: none` on the rail with pointer events restored on children.

- [ ] **Step 2: Add desktop sizing and mobile safe-area rules**

Use a readable desktop width cap and add a narrow-screen media query that sets `left` and `right` from one horizontal gutter, `width: auto`, and `bottom: max(1rem, env(safe-area-inset-bottom))`.

- [ ] **Step 3: Preserve tone styles and add reduced-motion handling**

Keep success/error/info token usage, add a 180ms opacity/translate entrance transition to `.app-toast__item`, and disable that animation under `prefers-reduced-motion: reduce`.

- [ ] **Step 4: Run the client build to validate SCSS output**

Run `pnpm --dir client build` and confirm Vite compiles the updated stylesheet.

### Task 4: Review, Wiki maintenance, and full verification

**Files:**

- Modify: `Wiki/index.md`
- Modify: `Wiki/overview.md`
- Modify: `Wiki/log.md`

- [ ] **Step 1: Record the global Toast placement decision in Wiki**

Document that Toasts are portal-mounted fixed UI, while Header notification badges and contextual inline errors retain their existing roles.

- [ ] **Step 2: Run the complete client verification set**

```powershell
pnpm --dir client test -- --run
pnpm --dir client exec tsc -p tsconfig.json --noEmit
pnpm --dir client lint
pnpm --dir client build
git diff --check
```

- [ ] **Step 3: Review the diff and report existing warnings separately**

Confirm no Header markup, caller API, secret, or unrelated page behavior changed. Report lint warnings and any Vite environment warnings separately from pass/fail results.
