---
title: Prefer Header
description: Opt into non-default management API behaviors per request with the RFC 7240 Prefer header. First supported token — Prefer:include-linked — relaxes the default 404 on secondary identities.
---

# `Prefer` Header

The AuthHero management API accepts the standard [RFC 7240](https://datatracker.ietf.org/doc/html/rfc7240) `Prefer` request header so callers can opt into non-default response behaviors per request. The default response shape always matches Auth0; preferences only loosen or augment that default when the caller asks for it.

When the server honors a preference, it echoes the token back in a `Preference-Applied` response header — letting the caller verify which preferences actually affected the response.

Unknown preference tokens are silently ignored, per the RFC. Multiple tokens can be combined with commas.

## Why a header (not a query param)?

The Auth0 management SDKs expose typed methods that don't accept ad-hoc query parameters cleanly, but their `initOverrides` argument can add request headers in a one-liner. Using `Prefer` also keeps the URL surface byte-identical to Auth0, so existing tooling, logs, and cache keys are unaffected.

## Supported tokens

| Token            | Applies to                | Effect                                                                                                                |
| ---------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `include-linked` | `GET /api/v2/users/{id}`  | Returns a linked secondary user instead of `404`. The response body includes `linked_to` pointing at the primary user. |

The token list is intentionally small — entries are added as concrete needs surface (e.g. a future `resolve-primary` could follow a link and return the primary user directly).

## `include-linked`

By default `GET /api/v2/users/{id}` returns `404` for a user that has been merged into another via account linking (matching Auth0). Admin tooling that holds a secondary-identity ID can opt in:

```bash
# Default — secondary identity returns 404
curl https://auth.example.com/api/v2/users/email%7CuserId2 \
  -H "Authorization: Bearer $TOKEN"

# With Prefer: include-linked — returns the secondary user with linked_to set
curl https://auth.example.com/api/v2/users/email%7CuserId2 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Prefer: include-linked"
```

Successful response (truncated):

```json
{
  "user_id": "email|userId2",
  "email": "foo2@example.com",
  "connection": "email",
  "provider": "email",
  "linked_to": "email|userId1"
}
```

And the response headers include:

```
Preference-Applied: include-linked
```

If the requested user is **not** linked, the response is `200` as normal and `Preference-Applied` is omitted — the preference had no observable effect.

## Using it from the Auth0 Node SDK

The header rides through the SDK's `initOverrides` argument:

```ts
import { ManagementClient } from "auth0";

const management = new ManagementClient({
  domain: "auth.example.com",
  token: accessToken,
});

const user = await management.users.get(
  { id: "email|userId2" },
  {
    headers: { Prefer: "include-linked" },
  },
);
```

## Combining tokens

Multiple preferences are comma-separated:

```
Prefer: include-linked, some-future-token
```

The server applies each independently and lists only the honored ones in `Preference-Applied`.

## See also

- [Account Linking (Auth0 comparison)](../auth0-comparison/account-linking) — how primary/secondary identities are modeled.
- [Endpoints](./endpoints) — full list of management API routes.
