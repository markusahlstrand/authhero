# Custom Token Exchange

Custom Token Exchange lets a trusted backend trade a token it signed for AuthHero tokens for one of your users, without a login screen. It follows [RFC 8693](https://datatracker.ietf.org/doc/html/rfc8693) and is compatible with [Auth0's Custom Token Exchange](https://auth0.com/docs/authenticate/custom-token-exchange).

A typical case: your application already has a session for a user (for example via better-auth or your own login) and needs an AuthHero access token for that user to call an API.

```
your backend ── signs JWT ──▶ POST /oauth/token ──▶ AuthHero access token (+ id_token)
```

The result is tokens only. No AuthHero browser session is created, and no refresh token is issued. Exchange again when the access token expires.

## How it fits together

Three things have to be in place:

1. **A token exchange profile** that claims a `subject_token_type` (a URI you choose, such as `urn:acme:session-token`) and says how tokens of that type are verified and which user they map to.
2. **The Custom Token Exchange flag on the application** that performs the exchange.
3. **The application must be first-party**, and if it restricts `grant_types`, the list must include `urn:ietf:params:oauth:grant-type:token-exchange`.

A profile verifies the subject token in one of two ways:

| Mode | Where the logic lives | Use it when |
| --- | --- | --- |
| **Verify JWT** (AuthHero extension) | Declarative settings on the profile | Your backend signs a standard JWT with a key you can publish as a JWKS. No code needed. |
| **Action** (Auth0-compatible) | An action on the `custom-token-exchange` trigger | The subject token is opaque, needs a lookup, or needs custom rules. |

## Verify JWT profiles

AuthHero verifies the subject token itself:

- The signature is checked against your keys. You supply them inline (`jwks`) or as a URL (`jwks_uri`, https only). Only asymmetric algorithms are accepted (RS256/384/512, ES256/384/512). You can narrow this with `algorithms`. Keys may omit `alg`: the key type and the token header decide it, as in most published JWKS documents.
- `iss` must equal the profile's `issuer` exactly.
- `aud` must include one of `audience`. If you leave `audience` out, it defaults to the tenant's issuer and its `/oauth/token` URL.
- `exp` is required. The token may not live longer than `max_lifetime_seconds` (default 300, at most 3600). Clock skew of 30 seconds is tolerated.
- `jti` is required by default, and each value is accepted only once. Set `require_jti: false` to allow tokens without one.
- `sub` names the user, as described under `user_mapping` below.

### User mapping

- **`{ "type": "user_id" }`**: `sub` is an existing AuthHero `user_id`. Nothing is created. This is the simplest option when your backend already stores the AuthHero user id, for example the `sub` it received when the user logged in through AuthHero with OIDC.
- **`{ "type": "connection", "connection": "<name>" }`**: `sub` is your own id for the user. AuthHero looks up, or creates, the user `<connection strategy>|<sub>` in that connection. Profile claims (`email`, `name`, `given_name`, `family_name`, `nickname`, `picture`, `phone_number`) are copied onto new users.
  - `create_if_not_exists` (default `true`): when `false`, unknown users are rejected.
  - `trust_email_verified` (default `false`): copy the token's `email_verified` onto new users. A verified email is what [account linking](./account-linking) keys on, so enabling it lets your token issuer attach new identities to existing accounts with the same address. Only enable it if your backend really verifies emails.

### Creating a profile

```http
POST /api/v2/token-exchange-profiles
Content-Type: application/json

{
  "name": "Acme sessions",
  "subject_token_type": "urn:acme:session-token",
  "type": "custom_authentication",
  "jwt_verification": {
    "issuer": "https://app.acme.com",
    "jwks_uri": "https://app.acme.com/.well-known/jwks.json",
    "user_mapping": { "type": "user_id" }
  }
}
```

`subject_token_type` must start with `https://` or `urn:`. It cannot use the reserved `urn:ietf:params:oauth:`, `urn:auth0` or `urn:okta` namespaces, and it must be unique within the tenant.

Then enable the flag on the application:

```http
PATCH /api/v2/clients/{client_id}
Content-Type: application/json

{ "token_exchange": { "allow_any_profile_of_type": ["custom_authentication"] } }
```

Both can also be done in the admin UI: **Custom Token Exchange** in the sidebar, and the **Custom Token Exchange** toggle on the application's Advanced tab.

### Signing and exchanging a token

Your backend signs a short-lived JWT:

```ts
import { SignJWT, importPKCS8 } from "jose";

const key = await importPKCS8(process.env.EXCHANGE_PRIVATE_KEY!, "RS256");

const subjectToken = await new SignJWT({})
  .setProtectedHeader({ alg: "RS256", kid: "acme-2026-09" })
  .setIssuer("https://app.acme.com")
  .setAudience("https://auth.acme.com/") // your AuthHero issuer
  .setSubject(user.authheroUserId)
  .setJti(crypto.randomUUID())
  .setIssuedAt()
  .setExpirationTime("60s")
  .sign(key);
```

Then it exchanges the JWT:

```http
POST /oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=urn:ietf:params:oauth:grant-type:token-exchange
&client_id=CLIENT_ID
&client_secret=CLIENT_SECRET
&subject_token=eyJhbGciOi...
&subject_token_type=urn:acme:session-token
&audience=https://api.acme.com
&scope=openid profile read:orders
```

The response is a normal token response. `audience`, `scope` and `organization` behave as on other user grants: scopes are narrowed to what the user is granted for the audience, and `organization` requires membership.

## Action profiles

For anything the declarative mode can't express, point the profile at an action instead of `jwt_verification`:

```json
{
  "name": "Acme opaque tokens",
  "subject_token_type": "urn:acme:opaque",
  "type": "custom_authentication",
  "action_id": "act_..."
}
```

The action must list `custom-token-exchange` in `supported_triggers`. It cannot be changed after the profile is created, and it cannot be deleted while a profile uses it. It is not bound through trigger bindings.

```js
exports.onExecuteCustomTokenExchange = async (event, api) => {
  const { subject_token, subject_token_type } = event.transaction;

  const acmeUser = await lookUp(subject_token, event.secrets);
  if (!acmeUser) {
    api.access.rejectInvalidSubjectToken("unknown token");
    return;
  }

  api.authentication.setUserByConnection(
    "Username-Password-Authentication",
    { user_id: acmeUser.id, email: acmeUser.email, email_verified: true },
    { creationBehavior: "create_if_not_exists", updateBehavior: "none" },
  );
};
```

The action must call exactly one of:

- `api.authentication.setUserById(user_id)`: an existing user.
- `api.authentication.setUserByConnection(connection, attributes, options)`: find or create `<connection strategy>|<attributes.user_id>`.
  - `creationBehavior` is `create_if_not_exists` (the default) or `none`.
  - With `updateBehavior: "replace"`, name and picture fields are updated on an existing user. `email`, `email_verified`, `phone_number`, `phone_verified` and `username` are never changed on an existing user.

To refuse the exchange, call one of:

- `api.access.rejectInvalidSubjectToken(reason)`: the subject token is bad. It counts towards brute-force protection.
- `api.access.deny(code, reason)`: any other refusal. It returns a 400 with `error: code`.

Actions run in a sandbox without `require`, so they can't load `jose` or other packages. If your subject token is a JWT, use the declarative mode. Actions can call `fetch`, so opaque tokens can be validated against the system that issued them, for example an introspection endpoint whose URL and credentials are kept in the action's secrets. The admin UI's starter code for this trigger does exactly that.

## Errors

| Situation | Response |
| --- | --- |
| No profile for the `subject_token_type` | `400 invalid_request` "Unsupported subject_token_type" |
| Application lacks the flag, or is third-party | `400 unauthorized_client` |
| Confidential application without valid credentials | `401 invalid_client` |
| Subject token fails verification, or the action rejects it | `400 invalid_request` "Invalid subject token" |
| Too many invalid subject tokens from one IP | `429 too_many_attempts` (only when a rate-limit adapter is configured) |

The reason a subject token was rejected is written to the tenant logs as a **Failed Exchange Custom Token** (`fecte`) entry and is never returned to the caller. Successful exchanges are logged as `secte`.

Public applications (`token_endpoint_auth_method: none`) may exchange without a secret, as on Auth0. The signed subject token is the proof, and invalid tokens are throttled.

## Differences from Auth0

- The declarative **Verify JWT** mode is an AuthHero extension.
- No refresh tokens are issued for this grant.
- `jwks_uri` is fetched on every exchange, so keep the endpoint fast and cacheable.
