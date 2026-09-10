# Security policy

Digital-E processes customer accounts, orders, addresses, payment state, inventory, and admin operations. Report suspected vulnerabilities privately so maintainers can investigate before details become public.

## Supported versions

The current `main` branch is the supported development and release line. Older branches and forks do not receive project-level security fixes.

| Version | Supported |
| --- | --- |
| `main` | Yes |
| Older branches and forks | No |

## Report a vulnerability

Do not open a public issue or pull request for a suspected vulnerability. Contact the repository maintainers through a private channel or use GitHub private vulnerability reporting when it is enabled for the repository.

Include enough detail to reproduce and assess the issue:

- Affected route, page, module, dependency, or configuration
- Preconditions and required account role
- Reproduction steps and a minimal proof of concept
- Expected and actual behavior
- Security impact and affected data or operations
- Relevant request, response, screenshot, or sanitized log excerpt
- Suggested mitigation, if known

Remove production secrets, real customer data, access tokens, cookies, database URLs, and private keys before sending a report. If a report exposes data that is not yours, stop testing and tell the maintainers what was accessed.

## Response targets

The project uses these targets for initial triage. They are targets, not guarantees:

| Severity | Initial response | Target fix window |
| --- | --- | --- |
| Critical | 48 hours | 7 days |
| High | 72 hours | 14 days |
| Medium | 7 days | 30 days |
| Low | 14 days | Best effort |

Timing depends on reproducibility, affected surface, release risk, and the availability of a safe fix.

## Security scope

Reports are in scope when they demonstrate a practical impact in the application or its release process, including:

- Authentication or authorization bypasses
- Email-verification bypasses, token replay, account-enumeration, or unintended access to checkout/review actions
- Admin route exposure or cross-account customer data access
- JWT, cookie, refresh-session, CSRF, or guest-order-token weaknesses
- SQL injection, path traversal, file upload abuse, or cross-site scripting
- Checkout, payment, promotion, inventory, reservation, or order-state manipulation
- Sensitive data leakage in API responses, logs, bundles, artifacts, or configuration
- Dependency or GitHub Actions vulnerabilities with an applicable exploit path
- Database target isolation or migration safety bypasses

The following are out of scope unless they demonstrate a concrete application impact:

- Social engineering, phishing, or credential stuffing
- Denial-of-service testing against shared or production infrastructure
- Physical access to a developer machine
- Scanner output without reproduction steps or impact analysis
- Missing security headers without a demonstrated exploit

## Safe testing rules

Use local development or an approved test environment. The supported local database is the Docker MySQL service at `127.0.0.1:3307`; do not test against a remote development or production database unless the maintainers explicitly approve it.

- Do not modify, delete, export, or exfiltrate real user data
- Do not use high-volume or destructive testing against shared infrastructure
- Do not attempt phishing, credential stuffing, or social engineering
- Use the local demo accounts only with the local demo database
- Stop immediately if a test reaches data that is not yours

## Security controls to preserve

Contributors must preserve the controls implemented in the current codebase:

- Production authentication verifies Firebase identity before the server issues its own session; local development can use the configured local provider
- Registration is provider-aware, but both providers converge on server-owned sessions and server-owned email verification state
- Verification tokens are single-use, expire after 24 hours, stored only as SHA-256 hashes, and are never logged or returned by API responses
- Unverified sessions may browse and manage an account, but `VerifiedEmailGuard` protects authenticated checkout, Stripe checkout-session creation, and review creation
- Verification resend responses are generic and rate-limited; Resend delivery failures do not expose raw tokens or roll back account creation
- Password-reset requests are generic, local reset tokens are one-time SHA-256 hashes with one-hour expiry, and successful local resets revoke active sessions and send a security notice
- Email changes remain pending until the new address confirms; old/new address notices and marketing welcome/unsubscribe links use the shared Resend boundary without logging raw tokens
- Customer-facing Resend delivery is gated by the server-side email verification state; verification and email-change confirmation messages remain explicit ownership-verification exceptions, and guest order confirmations do not depend on account verification
- Access and refresh tokens use cookie-backed, database-aware sessions; refresh sessions are hashed, rotated, and revocable
- `AuthGuard`, `RolesGuard`, and `OwnerParam` enforce authentication, role, and ownership boundaries
- Unsafe requests use the double-submit CSRF middleware; login, registration, and refresh keep their explicit exclusions
- Zod validates write payloads before persistence, and repositories use parameterized database access
- Guest checkout stores only product IDs and quantities in the guest cart; prices and stock come from the server, while the database stores only a hash of the raw guest order token
- Sensitive rate limits use Redis in production when `REDIS_URL` is configured, with process-local fallback otherwise
- New schema changes use reviewed forward Prisma migrations, and database-target guards protect local operations
- Logs use request correlation and must not contain secrets, tokens, cookies, passwords, or unnecessary personal data

## Coordinated disclosure

Give maintainers reasonable time to validate, fix, and release a confirmed issue before public disclosure. Coordinated disclosure helps protect users and keeps the fix traceable.
