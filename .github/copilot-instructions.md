# Copilot Instructions — digital-e-shop

## Project overview
E-commerce website selling electronic devices and components. Monorepo with two workspaces:
- `client/` — React + Vite + TypeScript + SCSS frontend
- `server/` — Express.js backend with JWT authentication

Database: MySQL, hosted on Aiven. Package manager: pnpm. Deployment: Vercel. CI/CD: GitHub Actions.

## Setup & commands
- Install dependencies: `pnpm install`
- Run client dev server: `pnpm --filter client dev`
- Run server dev: `pnpm --filter server dev`
- Typecheck client: `pnpm --filter client exec tsc --noEmit`
- Build client: `pnpm --filter client build`

## Coding conventions
- Use TypeScript strictly on the client — avoid `any`, prefer explicit types/interfaces.
- Follow existing SCSS module structure for styling; don't introduce a new CSS-in-JS approach.
- Keep API route handlers in `server/` thin — push business logic into service/helper modules rather than inline in route files.
- Match existing file/folder naming conventions already used in `client/src` and `server/src` rather than introducing new patterns.

## Security-sensitive areas — flag issues here first
- **JWT auth**: token generation, expiry, and refresh logic. Watch for missing expiry checks, weak secrets, or tokens leaking into logs/responses.
- **Database queries**: all MySQL queries must be parameterized. Flag any string-concatenated or template-literal SQL as a potential injection risk.
- **Input validation**: flag any API route accepting user input (especially checkout/order/payment-adjacent routes) that lacks validation.
- **Secrets**: flag any hardcoded API keys, DB credentials, or JWT secrets committed directly in code.
- **CORS config**: this project has had prior CORS/routing issues on Vercel — flag changes to CORS/middleware config that look overly permissive (e.g. wildcard origins) or that could break existing client-server routing.

## What NOT to flag
- Minor SCSS style preferences that don't affect functionality.
- Formatting-only differences already handled by existing lint/format tooling.

## Notes for reviewers (human or Copilot)
- This is a solo-maintained personal/portfolio project — prioritize correctness, security, and clarity over enterprise-scale patterns (e.g. don't suggest full microservices restructuring).
