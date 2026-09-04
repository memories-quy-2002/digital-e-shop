# Thunder Client import

This folder contains a Postman v2.1 collection that Thunder Client can import directly.

Files:

- `digital-e-shop.postman_collection.json`

Import steps in Thunder Client:

1. Open the `Collections` tab.
2. Open the collection menu and choose `Import`.
3. Select `digital-e-shop.postman_collection.json`.

Notes:

- Thunder Client documents that it supports importing `Postman 2.1.0` collections.
- Most write routes in this API require both:
  - a valid session cookie from login or social auth
  - `X-CSRF-Token`
- Run `Get CSRF Token` first, then copy the returned `csrfToken` into the collection variable if you are not chaining it automatically.
- Admin-only routes will still require an authenticated admin session.
