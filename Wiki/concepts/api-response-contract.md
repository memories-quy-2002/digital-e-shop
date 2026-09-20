# API response contract

Back to [[index]]. This page describes the shared HTTP metadata added by the
NestJS response interceptor and exception filter.

## Success

Normal JSON object responses keep their route-specific top-level keys and add:

- `success: true`
- `requestId`
- `message` when the route supplies a success message (derived from legacy
  `msg` when necessary)

The contract intentionally does not move route data under a new `data` key.
This keeps existing consumers compatible while allowing new consumers to use
the shared metadata.

## Errors

Expected and unexpected errors use:

- `success: false`
- `message`: canonical human-readable message
- `code`: stable machine-readable code
- `requestId`: request correlation ID
- `details`: structured details when available

`msg` and `error` remain human-readable compatibility aliases. New client
code should use `message` for display and `code` for branching. The client
helper in `client/src/lib/api-contract.ts` reads `message`, then the legacy
aliases, so older server responses remain usable during migration.

## Pagination and route data

List routes keep their domain collection key (`products`, `orders`,
`requests`, `notifications`, and similar) and expose pagination as a sibling
`pagination` object. Pagination is bounded by the owning route; empty result
sets may report `totalPages: 0`.

## Boundaries

The raw OpenAPI document route is intentionally not wrapped because clients
need to parse the specification itself. Stream/file responses and explicit
Express responses also pass through their existing transport behavior. CSRF,
authentication, role, and ownership failures still use the shared error
envelope and request ID.
