---
"authhero": patch
"@authhero/admin": patch
---

Auth0-style typed clients: pick an app type up front, get the right defaults, see the right fields.

**Backend (`authhero`)**
- `POST /api/v2/clients` now derives `token_endpoint_auth_method` and `grant_types` from `app_type` when the caller doesn't supply them:
  - `spa`, `native` → `token_endpoint_auth_method: "none"`, `grant_types: ["authorization_code", "refresh_token"]`, no `client_secret` generated (PKCE-only).
  - `regular_web` → `token_endpoint_auth_method: "client_secret_basic"`, `grant_types: ["authorization_code", "refresh_token"]`, secret generated.
  - `non_interactive` → `token_endpoint_auth_method: "client_secret_basic"`, `grant_types: ["client_credentials"]`, secret generated.
  - Explicit caller values always win.
- `PATCH /api/v2/clients/:id` rejects with 400 when the target is a CIMD-marked client (`client_metadata.cimd === "true"`) — those are managed via the metadata document.
- `POST /api/v2/clients` rejects with 400 when `client_id` is a URL — CIMD clients are registered automatically on first `/authorize`.

**Admin UI (`@authhero/admin`)**
- Client create is now a two-step picker: choose app type (Regular Web / SPA / Native / Machine-to-Machine), then a small form scoped to that type. The selected `app_type` is sent with the create request so the backend defaults kick in.
- Client edit hides the `client_secret` field for public types (SPA, Native) and CIMD clients; hides Callbacks / Logout URLs / Web Origins for Machine-to-Machine clients.
