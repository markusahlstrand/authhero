---
title: Error Codes
description: Reference guide for AuthHero API error codes including HTTP status codes, authentication errors, and user-related error responses.
---

# Error Codes

This document provides a reference for error codes returned by the AuthHero API.

## Error Response Format

AuthHero uses two different error shapes, depending on which API you are calling.

### Management API

Management API errors (`/api/v2/*`) mirror Auth0's shape so that Auth0 SDKs —
including `go-auth0` and the Terraform provider, which parse error bodies
strictly — can unmarshal them:

```json
{
  "statusCode": 404,
  "error": "Not Found",
  "message": "User not found"
}
```

Request-body validation failures are translated into the same shape, with the
failing fields listed in `message`:

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Payload validation error: 'email' is required"
}
```

### OAuth and OIDC endpoints

The OAuth 2.0 / OIDC endpoints (`/authorize`, `/oauth/token`, `/userinfo`,
`/oidc/register`, …) return the error codes defined by their respective RFCs:

```json
{
  "error": "invalid_grant",
  "error_description": "Invalid authorization code"
}
```

For redirect-based failures at `/authorize`, the same `error` and
`error_description` are delivered as query parameters on the client's
`redirect_uri` (or in the fragment for non-`code` response types, or via
`postMessage` for `web_message` requests) rather than as a JSON body.

A handful of interactive login errors carry an uppercase `code` alongside the
message instead — see [Login flow error codes](#login-flow-error-codes) below.

## Common HTTP Status Codes

- `400 Bad Request`: The request was invalid or cannot be served
- `401 Unauthorized`: Authentication is required or failed
- `403 Forbidden`: The authenticated user doesn't have permission
- `404 Not Found`: The requested resource doesn't exist
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: An error occurred on the server

## OAuth 2.0 / OIDC error codes

These are the `error` values returned by the OAuth and OIDC endpoints.

| Code                     | Typical status | Meaning                                                                                                                 |
| ------------------------ | -------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `invalid_request`        | 400            | The request is missing a required parameter, or a parameter is malformed                                                |
| `invalid_client`         | 401 / 403      | Client authentication failed — unknown `client_id`, wrong `client_secret`, or an unacceptable `client_assertion`        |
| `invalid_grant`          | 403            | The authorization code, refresh token, OTP or ticket is invalid, expired, already used, or was issued to another client |
| `unauthorized_client`    | 403            | The client is not allowed to use this grant type                                                                        |
| `unsupported_grant_type` | 400            | The requested `grant_type` is not supported                                                                             |
| `invalid_scope`          | 400            | A requested scope is unknown or not permitted for this client                                                           |
| `access_denied`          | 403            | The request was refused — for example the user denied consent, or the account is blocked                                |
| `server_error`           | 500            | An unexpected error occurred while handling the request                                                                 |

### Errors specific to `prompt=none`

Silent authentication never shows UI, so anything that would need the user
returns an error instead of tokens:

| Code               | Meaning                                                                                                                                                        |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `login_required`   | No usable session — the user must authenticate interactively                                                                                                   |
| `consent_required` | A third-party client requested scopes the stored grant doesn't cover ([Third-party client consent](/features/authentication-flows#third-party-client-consent)) |

Both should be handled by falling back to an interactive `/authorize` redirect.

### Errors specific to Dynamic Client Registration

`/oidc/register` follows [RFC 7591](/standards/rfc-7591):

| Code                      | Meaning                                               |
| ------------------------- | ----------------------------------------------------- |
| `invalid_client_metadata` | A registration field is invalid or unsupported        |
| `invalid_redirect_uri`    | One of the supplied `redirect_uris` is not acceptable |

### Other endpoint-specific codes

| Code                        | Meaning                                                                                         |
| --------------------------- | ----------------------------------------------------------------------------------------------- |
| `invalid_token`             | The bearer token presented to `/userinfo` (or another protected endpoint) is invalid or expired |
| `unsupported_response_mode` | The `response_mode` requested at `/authorize` is not supported                                  |
| `connection_not_found`      | The requested `connection` does not exist on the tenant                                         |
| `strategy_error`            | The upstream identity provider for the connection returned an error                             |

## Login flow error codes

Errors raised while evaluating an interactive login carry an uppercase `code`
in addition to the message. These are AuthHero-specific and are not OAuth error
values:

| Code                     | Status | Meaning                                                     |
| ------------------------ | ------ | ----------------------------------------------------------- |
| `INVALID_PASSWORD`       | 403    | The password did not match                                  |
| `USER_NOT_FOUND`         | 403    | No user matched the supplied identifier                     |
| `USER_BLOCKED`           | 403    | The account is blocked and cannot log in                    |
| `EMAIL_NOT_VERIFIED`     | 403    | The connection requires a verified email address            |
| `TOO_MANY_FAILED_LOGINS` | 403    | Too many recent failed password attempts for this account   |
| `TOO_MANY_REQUESTS`      | 429    | A rate-limit scope was exhausted; may include `Retry-After` |

See [Rate Limiting](overview.md#rate-limiting) for the thresholds behind the
last two.

## Password policy error codes

Password validation (on signup, password reset and invitation acceptance)
reports the **first** unmet requirement, using the tenant's configured policy:

| Code                               | Meaning                                                         |
| ---------------------------------- | --------------------------------------------------------------- |
| `password_too_short`               | Shorter than the configured `min_length`                        |
| `password_missing_lowercase`       | No lowercase letter                                             |
| `password_missing_uppercase`       | No uppercase letter                                             |
| `password_missing_number`          | No digit                                                        |
| `password_missing_special`         | No special character                                            |
| `password_reused`                  | Matches one of the recently used passwords (`password_history`) |
| `password_contains_personal_info`  | Contains the user's name or email                               |
| `password_contains_forbidden_word` | Matches an entry in the tenant's password dictionary            |

On the hosted login screens the code is used to pick a localized message. On
`/dbconnections/signup` the failure surfaces as a `400` whose `message` is the
human-readable policy text.

::: tip Signup does not reveal existing accounts
Signing up with an email that already exists returns
`400 Invalid sign up` — the same response as other invalid signups — rather
than a distinct "user exists" code. This matches Auth0 and is deliberate: it
prevents the endpoint being used to enumerate accounts.
:::
