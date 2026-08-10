---
title: Users
description: Manage users in AuthHero including user properties, metadata, identities, account linking, and querying linked accounts.
---

# Users

Users are the individuals who authenticate through AuthHero. Each user belongs to one or more tenants and can have different attributes and permissions.

## User Properties

Each user has:

- **user_id**: Unique identifier (format: `{connection}|{id}`)
- **email**: Email address
- **email_verified**: Whether the email has been verified
- **name**: Full name
- **nickname**: Display name
- **picture**: Profile picture URL
- **user_metadata**: Custom data editable by the user
- **app_metadata**: Custom data editable by administrators only
- **identities**: Array of linked authentication identities
- **blocked**: Auth0-parity account block flag (see [Blocking a User](#blocking-a-user))
- **login_count / last_login / last_ip**: Login activity counters (see [Login Activity](#login-activity))

## Blocking a User

Setting `blocked: true` disables an account without deleting it:

```http
PATCH /api/v2/users/{user_id}
{
  "blocked": true
}
```

Effects:

- **All authentication is refused** — password, passwordless/OTP, social and enterprise logins, silent auth, and token exchange fail with `403 access_denied` ("User is blocked"). Password logins are checked *after* credential validation, so the block status is never leaked to someone without valid credentials.
- **Refresh tokens stop working** — the `refresh_token` grant returns `invalid_grant` with "User is blocked".
- **Existing sessions are revoked** — on the transition into blocked, every session and its refresh tokens are revoked and a `SUCCESS_REVOCATION` log event is written. Already-issued access tokens are stateless JWTs and remain valid until they expire.

Blocking always operates on the **primary account**: blocking it blocks every linked identity, and a `blocked` value sent in an update targeting a linked identity is applied to the primary so it can't silently do nothing.

Unblock with `blocked: false` (this revokes nothing). You can filter on the flag with `GET /api/v2/users?q=blocked:true`.

[SCIM inbound provisioning](/features/scim-provisioning) maps `active: false` to `blocked: true` (and vice versa), with the same session revocation on deactivation. Note that the admin UI has no blocked toggle yet — blocking is Management API / SCIM only today.

## Login Activity

`login_count`, `last_login`, and `last_ip` appear on user records returned by the Management API and can be used in `q=` filters and sorts (e.g. `q=login_count:0` finds users who never logged in). They are stored in a separate write-often `user_activity` table (see the [database schema](/database/schema)) — joined into user reads transparently — so the profile row isn't rewritten on every login.

The same table backs the failed-password lockout window (`failed_logins`) and `last_password_reset`; those fields are internal to the authentication flows and are not exposed through the Management API.

## Account Linking

Account linking allows a single user to have multiple authentication identities (connections) consolidated into one user profile. This is useful when:

- A user signs up with email/password and later wants to link a social login
- A user has multiple email addresses they want to use with the same account
- You want to consolidate user accounts that represent the same person

### Primary and Secondary Accounts

When accounts are linked:

- One account becomes the **primary account** - this is the main user profile
- Other accounts become **secondary (linked) accounts** - these are attached as additional identities

### Updating Linked Accounts

You can update properties of linked accounts by specifying the `connection` parameter in the user update API:

```json
PATCH /api/v2/users/{primary_user_id}
{
  "phone_number": "+1234567890",
  "connection": "sms"
}
```

Supported operations on linked accounts:

- Update user metadata and app metadata
- Update email verification status
- Update phone numbers (for SMS connections)
- Update passwords (for Username-Password-Authentication connections only)

### Important Limitations

- You cannot directly update a linked (secondary) account - all updates must go through the primary account
- Password updates on linked accounts are only supported for `Username-Password-Authentication` connections
- Attempting to update a linked account directly (via its own user_id) will return a 404 error

### Querying Linked Accounts

When retrieving a primary user, all linked identities are included in the `identities` array:

```json
{
  "user_id": "email|primary-user",
  "email": "user@example.com",
  "identities": [
    {
      "provider": "email",
      "user_id": "primary-user",
      "connection": "email",
      "isSocial": false
    },
    {
      "provider": "sms",
      "user_id": "secondary-user",
      "connection": "sms",
      "isSocial": false,
      "profileData": {
        "phone_number": "+1234567890"
      }
    }
  ]
}
```

## OAuth Grants

When a user authorizes a [third-party client](/features/authentication-flows#third-party-client-consent), AuthHero stores the granted scopes in a `grants` row keyed by `(tenant_id, user_id, client_id, audience)`. Re-authorizing the same client/audience unions the new scopes into the existing row, so the screen only re-appears when a client asks for something genuinely new.

First-party clients (the default, `is_first_party: true`) and the OIDC basic scopes (`openid`, `profile`, `email`) never produce a grant — they're exempt from the gate.

### Schema (Auth0 wire shape)

| Field      | Type     | Notes                                              |
|------------|----------|----------------------------------------------------|
| `id`       | string   | nanoid                                             |
| `user_id`  | string   | references the granting user                       |
| `clientID` | string   | references the client (Auth0 camelCase oddity)     |
| `audience` | string?  | target audience the grant applies to               |
| `scope`    | string[] | unioned set of granted OAuth scopes                |

### List grants

```http
GET /api/v2/grants?user_id={user_id}
Authorization: Bearer <token with read:grants or auth:read>
```

Supports `user_id`, `client_id`, and `audience` query filters plus `include_totals` for the paginated envelope.

When the adapter doesn't implement `grants`, the endpoint returns an empty array — the feature degrades to "all clients behave as first-party" rather than failing.

### Delete grants

```http
DELETE /api/v2/grants/{id}
DELETE /api/v2/grants?user_id={user_id}
```

## API Reference

- [GET /api/v2/users](/api/endpoints#get-users)
- [POST /api/v2/users](/api/endpoints#create-user)
- [PATCH /api/v2/users/:id](/api/endpoints#update-user)
- [DELETE /api/v2/users/:id](/api/endpoints#delete-user)
- [POST /api/v2/users/:id/identities](/api/endpoints#link-user-account)
- [GET /api/v2/grants?user_id=:id](/api/endpoints#list-grants)
- [DELETE /api/v2/grants/:id](/api/endpoints#delete-grant)
