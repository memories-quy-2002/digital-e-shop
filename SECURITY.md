# Security Policy

Digital-E handles customer accounts, orders, addresses, promotions, and admin
operations. Security issues should be reported privately so they can be fixed
before details are shared publicly.

## Supported Versions

Security fixes are prioritized for the current `master` branch.

| Version | Supported |
| --- | --- |
| Current `master` | Yes |
| Older branches or forks | No |

## Reporting a Vulnerability

Do not open a public GitHub issue for a suspected vulnerability.

Report security issues by contacting the repository owner directly through a
private channel, or by using GitHub private vulnerability reporting if it is
enabled for this repository.

Include as much detail as possible:

- Affected area, route, page, or file.
- Steps to reproduce.
- Expected behavior and actual behavior.
- Required account role, if any.
- Example request, response, screenshot, or log excerpt.
- Potential impact.
- Suggested fix, if known.

Do not include real customer data, production secrets, access tokens, cookies,
or database dumps in the report.

## Response Targets

The project aims to follow these response targets:

| Severity | First response | Target fix window |
| --- | --- | --- |
| Critical | 48 hours | 7 days |
| High | 72 hours | 14 days |
| Medium | 7 days | 30 days |
| Low | 14 days | Best effort |

These are targets, not guarantees. Fix timing depends on reproducibility, scope,
and release risk.

## Security Scope

In scope:

- Authentication and authorization bypasses.
- Admin-only route exposure.
- Customer data exposure across accounts.
- SQL injection.
- Cross-site scripting.
- CSRF bypasses on unsafe requests.
- Promotion, checkout, order, payment method, or inventory logic abuse.
- Sensitive data leakage in logs, responses, or client bundles.
- Dependency vulnerabilities with a practical exploit path.

Out of scope:

- Social engineering.
- Denial-of-service testing against shared or production infrastructure.
- Vulnerabilities requiring physical access to a developer machine.
- Reports based only on missing security headers without a demonstrated impact.
- Automated scanner output without reproduction steps or impact explanation.

## Safe Testing Rules

- Use local development or an approved test environment.
- Do not modify, delete, export, or exfiltrate real user data.
- Do not run destructive or high-volume tests against shared infrastructure.
- Do not attempt credential stuffing, phishing, or social engineering.
- Stop testing and report immediately if you access data that is not yours.

## Project Security Practices

Contributors should preserve these practices:

- Keep unsafe requests behind the existing CSRF flow.
- Enforce role checks on admin endpoints.
- Validate resource ownership for customer routes.
- Keep secrets out of source control.
- Avoid logging access tokens, cookies, passwords, or personal data.
- Use parameterized SQL queries instead of string-built SQL.
- Prefer soft-delete behavior for products and audit-sensitive records.
- Run dependency checks and review security alerts before release.

## Disclosure

Please allow maintainers reasonable time to investigate and fix confirmed
issues before public disclosure. Coordinated disclosure helps protect users and
keeps fixes traceable.
