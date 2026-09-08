# Toast Viewport Design

## Goal

Give transient notifications a stable global viewport that never participates in the Header or page layout, while keeping validation and other persistent guidance close to the action that caused it.

## Approved behavior

- Keep the Header limited to navigation and the persistent unread-notification entry point.
- Render the Toast viewport through a `document.body` portal owned by `ToastProvider`.
- Place the stack fixed at the lower-right on desktop, with a width capped for readable messages.
- On narrow screens, use the lower safe-area with a full-width stack and horizontal page padding.
- Keep at most three transient Toasts visible; preserve insertion order so the newest message remains closest to the viewport edge.
- Keep the existing tone inference, close button, auto-hide durations, `aria-live="polite"`, and visual Digital-E tokens.
- Do not move form validation, checkout stock errors, or payment errors out of their inline context.

## Accessibility and interaction

- The viewport remains a labelled live region and does not steal focus when a Toast appears.
- Every Toast keeps its keyboard-accessible close control.
- Fixed positioning must not cause document reflow or overlap the sticky Header.
- Respect `prefers-reduced-motion` for any Toast entrance transition.
- Respect `env(safe-area-inset-bottom)` on mobile devices.

## Acceptance criteria

1. The Toast viewport is a direct child of `document.body`, not a child inside Header or the app shell flow.
2. Toasts are fixed at the lower-right on desktop and full-width within safe mobile margins.
3. Adding a fourth Toast keeps only the latest three visible.
4. Existing tone, close, auto-hide, and live-region behavior remains intact.
5. Existing callers of `addToast` require no changes.
