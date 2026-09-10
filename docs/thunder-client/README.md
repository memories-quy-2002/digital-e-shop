# Thunder Client import

This directory contains a Postman v2.1 collection that Thunder Client can import for the documented API subset. Use the live Scalar reference at `http://localhost:4000/docs` and [API.md](../API.md) as the source of truth for current routes, including guest checkout and support tickets.

## Import the collection

1. Open Thunder Client's **Collections** tab
2. Open the collection menu and select **Import**
3. Select `digital-e-shop.postman_collection.json`
4. Set the collection base URL to the running server, usually `http://localhost:4000`

## Authentication and CSRF

Most write routes require a cookie-backed session and the CSRF header:

- Log in through `POST /api/users/login` or register through `POST /api/users/register`
- Request `GET /api/users/csrf`
- Keep the returned `csrfToken` cookie
- Send the token in `X-CSRF-Token` for unsafe requests

Admin routes require an authenticated admin session. Customer routes also enforce ownership. The collection does not replace the server's guards or response contracts.

Do not paste production cookies, tokens, or secrets into a committed collection or public issue.
