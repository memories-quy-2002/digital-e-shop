# Customer Notification Entry Points Design

**Status:** Approved for implementation on 2026-09-10

## Goal

Remove notification updates from the Customer Account overview and make the
header bell the primary entry point for recent notifications. The `View all`
action must open the existing standalone `/notifications` page.

## Approved behavior

- The Customer Account overview no longer fetches or renders notification
  cards, notification shortcuts, or notification unread statistics.
- The Customer Account navigation hides its `Notifications / Updates` entry;
  the standalone Notifications page keeps its own full-page navigation.
- An authenticated user can click the desktop header bell to open a compact
  notification popover containing the latest notifications and unread state.
- The popover is closed by clicking outside it, pressing Escape, following a
  notification link, or following `View all`.
- `View all` navigates to `/notifications`, which remains the full customer
  notification history page with its existing mark-all-read behavior.
- An anonymous user who clicks the bell is sent to
  `/login?redirect=%2Fnotifications`, allowing the existing Login/Signup flow
  to continue without exposing customer notification data.
- The mobile menu continues to use its notification action to navigate to the
  full `/notifications` page rather than opening a desktop-sized popover.

## Implementation boundaries

- Reuse `fetchCustomerNotifications` and the existing customer notification
  type. No API, database, authentication, CSRF, or route-contract changes are
  required.
- Keep the existing unread badge on the header bell.
- Preserve unrelated worktree changes and the existing Customer Account,
  notification page, and admin notification behavior.
- Use existing SCSS variables and the current header/account BEM naming.

## Verification

- Header tests cover anonymous redirect, authenticated popover contents, and
  `View all` navigation.
- TypeScript, client lint, client build, focused Vitest tests, and the client
  full test suite are run when available.
