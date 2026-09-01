---
title: Your First Login
description: Run AuthHero locally and click through a complete login — the setup wizard, the admin dashboard, /authorize, the universal login screen, and the token exchange.
---

# Your First Login

[Getting Started](/getting-started) leaves you with a server running on `http://localhost:3000`. This page takes it from there: create the first tenant, sign in to the admin dashboard, then drive a full authorization-code login by hand — `/authorize` in the browser, the universal login screen, and the code exchange at `/oauth/token`.

Everything below uses the data the first run creates, so there is nothing else to configure before you start.

## 1. Start the server

Either install option from [Getting Started](/getting-started) works. They differ in how the first tenant is created:

**Docker** seeds it from environment variables on boot (`SEED=true` in `docker-compose.yml`):

```bash
docker compose up --build
```

**`create-authhero`** scaffolds a project and leaves the first tenant to a setup wizard:

```bash
npx create-authhero my-auth-app --admin-ui
```

Pass `--admin-ui` (or answer yes to the admin-UI prompt) if you want the dashboard served at `/admin` — the scaffold leaves it out otherwise. Then open `/setup`, enter an admin username or email address and a password of at least 8 characters, and submit. That wizard creates exactly what the Docker seed creates.

::: warning Which URL?
The Docker image serves plain HTTP on `http://localhost:3000`. The `local` template generates a self-signed certificate and serves **HTTPS** on `https://localhost:3000` instead. The examples below use the HTTP form; if you scaffolded with the CLI, swap in `https://` — and add `-k` to the `curl` commands (or trust the certificate, e.g. with `mkcert -install`).
:::

::: tip
If you change the port, change `ISSUER` to match. The issuer is used verbatim as the `iss` claim of every token, and the admin dashboard is configured from it.
:::

## 2. What the first run created

| Thing | Value |
| --- | --- |
| Tenant | `control_plane` under Docker; named from the setup wizard otherwise |
| Admin user | `ADMIN_USERNAME` / `ADMIN_PASSWORD` under Docker (`admin` / `admin` by default), or the identifier and password you typed into the wizard |
| Connection | `Username-Password-Authentication`, a database connection |
| Application | `Default Application`, client ID `default` |
| API | `urn:authhero:management`, the Management API |
| Role | `Tenant Admin`, holding every management permission, assigned to the admin user |

The `default` client already allows a handful of localhost callback URLs, including `http://localhost:3000/auth-callback` and `http://localhost:3000/admin/auth-callback`. That is what makes the rest of this page copy-pasteable.

::: warning
Log in with the exact identifier that was created. The Docker default is the username `admin` — not `admin@example.com`, which does not exist.
:::

## 3. Sign in to the admin dashboard

Open `http://localhost:3000/admin` in a browser.

The dashboard is a normal OAuth client — it has no private back door — so it immediately sends you through the same login everyone else gets:

1. It redirects the browser to `/authorize` with `client_id=default`.
2. AuthHero creates a login session and redirects to the universal login screen.
3. You enter the admin identifier, then the password.
4. AuthHero redirects to `/authorize/resume`, which sets the session cookie and hands an authorization code back to the dashboard.
5. The dashboard exchanges the code for tokens and lands on `/tenants`.

That is the whole flow, already working. The next section is the same thing again, one hop at a time, so you can watch each piece.

See [Admin Dashboard usage](/apps/admin/usage) for what you can do from here, and [Login flow](/architecture/login-flow) for what each endpoint owns.

## 4. Drive the login yourself

### Build the authorize URL

Open this in a browser — it is a single line, and the parameters are described below:

```
http://localhost:3000/authorize?client_id=default&response_type=code&redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fauth-callback&scope=openid%20profile%20email&state=first-login-demo&code_challenge=9j9EiB3lkZbI7S-wVNmqwlUkUKZu6yG0GnbJUU7sotk&code_challenge_method=S256
```

| Parameter | Why |
| --- | --- |
| `client_id=default` | The application created on first run. |
| `response_type=code` | Authorization code flow. |
| `redirect_uri` | Must be one of the application's allowed callback URLs. |
| `scope=openid profile email` | `openid` is what makes AuthHero return an ID token. |
| `state` | Echoed back to you; a real client uses it for CSRF protection. |
| `code_challenge` / `code_challenge_method` | PKCE. The challenge is the SHA-256 of the verifier used in step 5, so no client secret is needed. |

### Log in

You land on the universal login screen. Enter the admin identifier, then the password.

### Read the code out of the URL bar

The browser is redirected to:

```
http://localhost:3000/auth-callback?code=<authorization-code>&state=first-login-demo
```

Nothing is listening on that path, so you get a `404`. That is expected — the value you want is the `code` parameter in the address bar. Copy it.

::: tip
Authorization codes are single-use and short-lived. If the exchange below fails, re-run the authorize URL to get a fresh code.
:::

## 5. Exchange the code for tokens

```bash
curl -s -X POST http://localhost:3000/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d grant_type=authorization_code \
  -d client_id=default \
  -d redirect_uri=http://localhost:3000/auth-callback \
  -d code_verifier=authhero-getting-started-code-verifier-00001 \
  -d code=<authorization-code>
```

```json
{
  "access_token": "<a signed JWT>",
  "id_token": "<a signed JWT>",
  "token_type": "Bearer",
  "expires_in": 86400,
  "scope": "openid profile email"
}
```

`code_verifier` is the plaintext whose SHA-256 was sent as `code_challenge` in step 4. A confidential client sends `client_secret` instead — or as well, which is what [RFC 7636 — PKCE](/standards/rfc-7636) recommends.

## 6. Use the access token

```bash
curl -s http://localhost:3000/userinfo \
  -H "Authorization: Bearer <access-token>"
```

```json
{
  "sub": "auth0|<user-id>",
  "preferred_username": "admin",
  "email_verified": false,
  "picture": "http://localhost:3000/avatars/A.svg?bg=..."
}
```

Which claims come back depends on the scopes you asked for and on what the profile actually holds — `sub` is the only one always present. The Docker-seeded admin has no email address, so the `email` scope contributes nothing but `email_verified`.

The ID token is a JWT you can decode, or verify against `http://localhost:3000/.well-known/jwks.json`. The discovery document at `http://localhost:3000/.well-known/openid-configuration` lists every endpoint used above — that is what an Auth0-compatible SDK reads when you point it at your AuthHero domain.

## 7. Point your own application at it

The `default` client is a starting point, not a template for your app. To wire up something real:

1. In the admin dashboard, open **Applications**.
2. Either add your callback URL to `Default Application`, or create a new application for your app.
3. Add the URL your app is served from to the allowed callback URLs, and its origin to the allowed logout URLs.
4. Point any Auth0-compatible SDK at `http://localhost:3000` with that client ID.

Callback URLs are matched exactly, so `http://localhost:5173/callback` and `http://localhost:5173/callback/` are two different entries.

## When something goes wrong

| Symptom | Cause |
| --- | --- |
| `Invalid redirect URI - …` at `/authorize` | The `redirect_uri` is not in the application's allowed callback URLs. |
| `401 client_secret or code_verifier is required` | The token request carried neither PKCE nor client authentication. |
| `invalid_grant` / `Invalid authorization code` | The code was already used, or it expired. Start a fresh authorize request. |
| The login screen rejects your email address | The admin user is identified by whatever the first run created. Under Docker that is the username `admin`. |
| `/setup` redirects instead of showing the wizard | A tenant already exists, so setup is closed. Use the admin dashboard. |

## What's next

- [Login flow](/architecture/login-flow) — which endpoint owns which step
- [Universal Login](/architecture/universal-login) — customizing the screens you just clicked through
- [Authentication flows](/features/authentication-flows) — passwordless, refresh tokens, client credentials, device code
- [Auth0 compatibility](/architecture/auth0-compatibility) — what an Auth0 SDK can expect
