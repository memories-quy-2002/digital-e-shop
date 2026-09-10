# Customer Notification Entry Points Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move customer notification visibility out of the My Account overview and into a header-bell preview with a standalone full Notifications page.

**Architecture:** Keep the existing customer notification API and `/notifications` route. Extend the shared storefront `Header` with an authenticated, conditionally rendered preview popover and remove notification data/rendering from `CustomerAccountPage`; the mobile notification menu action continues to navigate directly to the full page.

**Tech Stack:** React 19, TypeScript, React Router, Vitest, Testing Library, SCSS, independent `client/` pnpm package.

## Global Constraints

- Preserve the existing customer notification API, route, auth, CSRF, and response contracts.
- Keep client and server independent; run commands through `pnpm --dir client ...`.
- Preserve unrelated dirty worktree changes and edit only the notification entry-point surface.
- Do not add dependencies or change the database.
- Anonymous bell clicks must navigate to `/login?redirect=%2Fnotifications`.

---

### Task 1: Define the header notification interactions with regression tests

**Files:**
- Modify: `client/src/components/layout/Header.test.tsx`

**Interfaces:**
- Consumes: the existing `Header` rendered inside `MemoryRouter`, the mocked auth context, and the mocked `fetchCustomerNotifications` function.
- Produces: regression coverage for the implementation in Task 2.

- [x] **Step 1: Extend the notification API mock and location probe.**

  Keep the existing `Header` test mocks, add a hoisted `fetchCustomerNotifications` mock with a default resolved response, and make the location probe include both pathname and search so the anonymous redirect can be asserted exactly:

  ```tsx
  const notifications = vi.hoisted(() => ({
      fetchCustomerNotifications: vi.fn(),
  }));

  vi.mock("../../features/users/api", () => ({
      fetchCustomerNotifications: notifications.fetchCustomerNotifications,
  }));

  const LocationProbe = () => {
      const location = useLocation();
      return <span data-testid="location">{location.pathname + location.search}</span>;
  };
  ```

- [x] **Step 2: Add the anonymous bell redirect test.**

  Render the existing guest header, click the desktop button named `Notifications`, and assert the location is `/login?redirect=%2Fnotifications`; assert the old login-required toast is not used for this path.

- [x] **Step 3: Add the authenticated preview and View all test.**

  Resolve the mock with one unread notification, render an authenticated customer, click `Notifications`, await the notification title, assert the preview is rendered in a named notification dialog, click the `View all` link, and assert `/notifications`.

- [x] **Step 4: Run the focused test before implementation.**

  Run `pnpm --dir client exec vitest run src/components/layout/Header.test.tsx --pool=threads`.

  Expected before the implementation: the new interaction assertions fail while the existing unrelated Header tests continue to run.

### Task 2: Implement the bell preview and responsive header styling

**Files:**
- Modify: `client/src/components/layout/Header.tsx`
- Modify: `client/src/styles/layout/_header.scss`
- Test: `client/src/components/layout/Header.test.tsx`

**Interfaces:**
- Consumes: `fetchCustomerNotifications`, `CustomerNotification`, `useAuth`, `useNavigate`, and existing header close behavior.
- Produces: an accessible desktop notification popover, `View all` navigation, and guest redirect behavior.

- [x] **Step 1: Add notification preview state and refs.**

  Import the customer notification type, create `notificationMenuRef`, `isNotificationMenuOpen`, and `notifications` state beside the existing profile state, and keep the existing `unreadNotifications` badge state.

- [x] **Step 2: Populate preview data from the existing header notification request.**

  In the current `userData?.id` effect, clear preview state for guests and, for authenticated users, set both `unreadNotifications` and `notifications` from `fetchCustomerNotifications(userData.id, 10)`. On failure, clear the badge and preview list. Do not render the preview while closed.

- [x] **Step 3: Add authenticated toggle and anonymous redirect handlers.**

  Use a dedicated handler for the desktop bell: preserve the existing loading toast, navigate anonymous users to `'/login?redirect=' + encodeURIComponent('/notifications')`, and toggle the popover for authenticated users. Use a separate page-navigation handler for the mobile menu notification action so authenticated users go to `/notifications` and guests use the same login redirect.

- [x] **Step 4: Close the popover from existing document interactions.**

  Extend the existing pointer-down and Escape listeners to check `notificationMenuRef` and close `isNotificationMenuOpen` when the click is outside or Escape is pressed. Close it before following notification links and `View all`.

- [x] **Step 5: Render the conditional notification popover around the bell.**

  Wrap the desktop bell button in `header__notifications`, add `aria-expanded` and `aria-controls`, and render a conditional `header__notifications__menu` with:

  ```tsx
  <div className="header__notifications__menu" role="dialog" aria-label="Notifications">
      <div className="header__notifications__header">
          <strong>Notifications</strong>
          <Link to="/notifications" onClick={() => setIsNotificationMenuOpen(false)}>
              View all
          </Link>
      </div>
      <div className="header__notifications__list">
          {notifications.length > 0 ? notifications.slice(0, 5).map(...) : <p>No notifications yet</p>}
      </div>
  </div>
  ```

  Each preview item uses `notification.link || '/notifications'`, displays title/message/time, and preserves unread styling. Use an explicit loading message while the initial request is unresolved.

- [x] **Step 6: Add header popover SCSS.**

  Add styles under `.header` for relative positioning, a bounded surface, header row, scrollable preview list, unread item state, loading/empty copy, and keyboard-visible focus. Use existing color, radius, shadow, and spacing variables. Keep the menu within the viewport with `width: min(360px, calc(100vw - 2rem))`; at narrow widths use `right: 0.75rem`, `left: 0.75rem`, and `width: auto` if the bell remains visible.

- [x] **Step 7: Run the focused Header tests after implementation.**

  Run `pnpm --dir client exec vitest run src/components/layout/Header.test.tsx --pool=threads` and expect all Header tests to pass.

### Task 3: Remove notification content from the Customer Account overview

**Files:**
- Modify: `client/src/features/users/pages/CustomerAccountPage.tsx`
- Modify: `client/src/features/users/components/CustomerAccountShell.tsx`
- Modify: `client/src/features/users/pages/CustomerAccountPage.test.tsx`
- Modify: `client/src/styles/features/users/_customer-account.scss`

**Interfaces:**
- Consumes: the existing customer identity, order, and address requests.
- Produces: an account overview with no notification list, notification shortcut, unread notification stat, or Notifications/Updates navigation entry.

- [x] **Step 1: Remove notification data dependencies from the account page.**

  Remove `BellIcon`, `CustomerNotification`, and `fetchCustomerNotifications` imports; remove notification state and memoized recent notifications; change the account `Promise.all` to fetch only the current customer, orders, and addresses; and remove notification wording from the page description.

- [x] **Step 2: Remove notification UI from loading and loaded account states.**

  Change the loading placeholders from three stats/actions/panels to two, remove the `Unread alerts` stat, remove the `Check updates` workflow card, remove the `Recent notifications` panel, and pass `hideNotificationsLink` to `CustomerAccountShell`. Keep the orders and saved-address panels unchanged; the standalone `CustomerNotificationsPage` keeps the default navigation.

- [x] **Step 3: Align account grid styles to two remaining panels.**

  Change the account stats, loading actions, and content grid to two columns at desktop widths, keep the existing one-column breakpoint, and remove the now-unused notification-list and unread-item selectors.

- [x] **Step 4: Run targeted checks and inspect the diff.**

  Run `pnpm --dir client exec tsc -p tsconfig.json --noEmit`, `pnpm --dir client lint`, and `git diff --check`. Confirm the diff contains no changes to server files or unrelated dirty paths.

### Task 4: Full frontend verification

**Files:**
- No additional source files.

**Interfaces:**
- Consumes: the completed Header and Customer Account changes.
- Produces: verified client quality-gate results for handoff.

- [x] **Step 1: Run the client build.**

  Run `pnpm --dir client build` and record the result.

- [x] **Step 2: Run the client test suite.**

  Run `pnpm --dir client test -- --run` and record pass/fail counts. Result: 66/67 files and 298/299 tests passed; the isolated failure is the unrelated `src/pages/HomePageTheme.test.ts` CRLF/LF assertion.

- [x] **Step 3: Re-read the final diff.**

  Run `git diff -- client/src/components/layout/Header.tsx client/src/components/layout/Header.test.tsx client/src/styles/layout/_header.scss client/src/features/users/pages/CustomerAccountPage.tsx client/src/styles/features/users/_customer-account.scss` and verify guest redirect, `View all`, outside/Escape close behavior, and absence of notification UI/API calls in My Account.
