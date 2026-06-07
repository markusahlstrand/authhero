---
title: Invitations & Tickets
description: Auth0-compatible organization invitations and email-verification / password-change tickets. Send styled invite emails, accept them via /u2/accept-invitation, and issue one-time URLs for verifying email or resetting passwords.
---

# Invitations & Tickets

AuthHero ships two adjacent Auth0-compatible flows that let you onboard or recover users out-of-band:

- **Organization invitations** — send a styled email with a link that the invitee follows to set a password, get added to the org with the configured roles, and sign in.
- **Tickets** — single-use, time-limited URLs that mark a user's email as verified or hand them into the password-reset flow without needing to know their current password.

Both reuse the same email-provider plumbing (Mailgun / Resend / Postmark / custom adapter) and Liquid template rendering as the rest of the email surface, so styling them works exactly the same as styling the verification or password-reset emails.

## Organization Invitations

### Sending an invitation

`POST /api/v2/organizations/:id/invitations` creates the invite, persists it, and — unless you opt out — sends the styled email to `invitee.email`.

```bash
curl -X POST https://your-tenant.example.com/api/v2/organizations/org_abc/invitations \
  -H "Authorization: Bearer $MANAGEMENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "inviter":  { "name": "Alice" },
    "invitee":  { "email": "newuser@example.com" },
    "client_id": "client_id_of_the_app_they_will_land_in",
    "roles":     ["rol_editor"],
    "ttl_sec":   604800,
    "send_invitation_email": true
  }'
```

The response includes the persisted invite, including the `invitation_url` that was sent in the email:

```json
{
  "id": "inv_xyz",
  "organization_id": "org_abc",
  "invitation_url": "https://your-tenant.example.com/u2/accept-invitation?invitation=inv_xyz&organization=org_abc",
  "expires_at": "2026-05-29T13:50:00.000Z",
  "roles": ["rol_editor"]
}
```

#### Request fields

| Field                   | Required | Notes                                                                                          |
| ----------------------- | -------- | ---------------------------------------------------------------------------------------------- |
| `inviter.name`          |          | Surfaced as <code v-pre>{{ inviterName }}</code> in the email template.                        |
| `invitee.email`         |          | Recipient of the email. If omitted, no email is sent regardless of `send_invitation_email`.    |
| `client_id`             | ✅       | The app the invitee lands in after signing up.                                                 |
| `connection_id`         |          | Reserved for future per-connection scoping; v1 uses the client's Username-Password connection. |
| `roles`                 |          | Role IDs assigned at the org level once the user accepts.                                      |
| `ttl_sec`               |          | Defaults to 604800 (7 days). Capped at 2592000 (30 days).                                      |
| `send_invitation_email` |          | Defaults to `true`. Set to `false` to receive the URL without delivery — useful for tests or when you want to deliver the link yourself. |
| `app_metadata` / `user_metadata` |  | Merged onto the user when they accept.                                                    |

If the email send fails (provider error, quota, etc.), the create call **still succeeds** and returns the invite — matching Auth0's behavior. The failure is logged through the standard `FAILED_SENDING_NOTIFICATION` log type.

### The acceptance flow

When the invitee clicks the link in the email, they land on `GET /u2/accept-invitation?invitation=…&organization=…`:

1. AuthHero looks up the invite (404 if missing, expired, or organization mismatch).
2. It resolves the invite's `client_id` and picks the first configured callback URL as the post-login redirect target. The client **must** have at least one callback configured.
3. A fresh login session is created with the invitation metadata (invite id, org id, roles, inviter name) stamped into `state_data`.
4. The browser is redirected to `/u2/accept-invitation?state=<sessionId>` which renders the password-set form.
5. On submit (`POST /u2/accept-invitation`):
   - The password is validated against the connection's password policy.
   - The user is created with `email_verified: true` (the invite link itself proves email ownership) or, if a user with that email already exists, that user is marked verified.
   - The user is added to the organization (idempotent), and the invite's roles are assigned at the org scope.
   - The invite is deleted.
   - The user is signed in via the standard `loginWithPassword` flow and redirected to the client's callback URL.

::: tip Currently password-only
v1 of the accept flow drives the Username-Password connection. Social-only invitations (where the invitee finishes via Google / GitHub / etc.) aren't wired yet — track this in the roadmap if you need it.
:::

### Styling the invitation email

The invitation email uses the `user_invitation` template, which works exactly like Auth0's:

```bash
curl -X PUT https://your-tenant.example.com/api/v2/email-templates/user_invitation \
  -H "Authorization: Bearer $MANAGEMENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "from":    "invites@your-company.com",
    "subject": "You'\''ve been invited to {{ organizationName }}",
    "syntax":  "liquid",
    "body":    "<html><body><h1>Hi,</h1><p>{{ inviterName }} invited you to {{ organizationName }}.</p><a href=\"{{ invitationUrl }}\">Accept invitation</a><p>This link expires in {{ ttlDays }} days.</p></body></html>"
  }'
```

Available Liquid variables in the `user_invitation` template:

- <code v-pre>{{ url }}</code> / <code v-pre>{{ invitationUrl }}</code>: The full accept-invitation URL (button target).
- <code v-pre>{{ inviterName }}</code>: `inviter.name` from the request body, or the tenant-friendly name as a fallback.
- <code v-pre>{{ organizationName }}</code>: Resolved from `display_name`, falling back to `name`, then `id`.
- <code v-pre>{{ ttlDays }}</code>: `ttl_sec` rounded to whole days, minimum 1.
- <code v-pre>{{ tenant.friendly_name }}</code>: Tenant display name.
- <code v-pre>{{ branding.logo }}</code>: Tenant logo URL.
- <code v-pre>{{ branding.primary_color }}</code>: Tenant primary color (used for the default button).
- <code v-pre>{{ support_info }}</code> / <code v-pre>{{ contact_us }}</code> / <code v-pre>{{ copyright }}</code>: Standard localized footer strings.

Omit the `PUT` and tenants fall back to AuthHero's bundled default — a clean, branded HTML template that respects the tenant's logo and primary color.

## Tickets

Tickets are Auth0-style one-time URLs the management API hands out to perform a specific action without the user needing to remember a password or click through an email flow first.

### `POST /api/v2/tickets/email-verification`

Issue a URL that, when followed, marks the targeted user's email as verified.

```bash
curl -X POST https://your-tenant.example.com/api/v2/tickets/email-verification \
  -H "Authorization: Bearer $MANAGEMENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id":    "auth0|userId",
    "result_url": "https://app.example.com/welcome",
    "ttl_sec":    432000
  }'
```

Response:

```json
{
  "ticket": "https://your-tenant.example.com/u2/tickets/email-verification?ticket=xxx&tenant_id=tenantId"
}
```

When the user opens that URL:

- The ticket is consumed atomically (single-use).
- `email_verified` is set to `true` on the user.
- The user is redirected to `result_url` if provided, otherwise a minimal success page is rendered.

### `POST /api/v2/tickets/password-change`

Issue a URL that drops the user into the standard reset-password screen with an authenticated session pre-bound to their account.

```bash
curl -X POST https://your-tenant.example.com/api/v2/tickets/password-change \
  -H "Authorization: Bearer $MANAGEMENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id":    "auth0|userId",
    "result_url": "https://app.example.com/login",
    "client_id":  "client_for_redirect_uri"
  }'
```

You may pass `email` instead of `user_id` for Auth0 parity. The handler resolves the user by email and rejects the call if no user is found.

Optional flags:

| Flag                       | Behavior                                                                           |
| -------------------------- | ---------------------------------------------------------------------------------- |
| `mark_email_as_verified`   | Marks the user's email verified before opening the reset screen.                   |
| `client_id` / `result_url` | Used to build the redirect target after the password reset completes. If both omitted, falls back to the first configured client's first callback. |
| `connection_id`            | Reserved for multi-connection tenants; v1 always uses the user's connection.       |

### Ticket lifetime

Both ticket types persist as rows in the `codes` table with `code_type: "ticket"`. They:

- Default to **5 days** (`432000` seconds) and can be capped down or up to a maximum of 30 days via `ttl_sec`.
- Are **single-use** — the `consume` step is atomic, so a second click on the same link returns `400 Ticket already consumed`.
- Expire automatically; an expired ticket returns `400 Ticket invalid or expired` without touching user state.

## Comparison with Auth0

| Capability                              | Auth0                                              | AuthHero                                                                                       |
| --------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Organization invitations                | `POST /api/v2/organizations/:id/invitations`       | Same path, same body. ✅                                                                       |
| Invitation URL                          | App URL with `invitation`, `organization` queries  | `https://<issuer>/u2/accept-invitation?invitation=…&organization=…` (handles signup natively). |
| Email verification ticket               | `POST /api/v2/tickets/email-verification`          | Same path, same body. ✅                                                                       |
| Password change ticket                  | `POST /api/v2/tickets/password-change`             | Same path, same body. ✅                                                                       |
| Email template customization            | `PUT /api/v2/email-templates/:name` (Liquid)       | Same endpoint, same Liquid syntax. ✅                                                          |
| Social-only invitations                 | ✅                                                 | v1 supports password connections only.                                                         |

## See also

- [Email Templates Management API](/security/management-api) — full reference for the `email-templates` endpoint.
- [Multi-Tenant SaaS](/features/multi-tenant-saas) — how organizations fit into the wider tenancy model.
- [RBAC & Scopes](/features/rbac-and-scopes) — how the invite's `roles` are scoped to the organization.
