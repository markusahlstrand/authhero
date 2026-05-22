---
"authhero": minor
---

Add Auth0-compatible invitation email flow and ticket endpoints.

- `POST /api/v2/organizations/:id/invitations` now sends a styled invitation email when `send_invitation_email` is true (default) and `invitee.email` is set. Ships a `user_invitation` default email template (override via `PUT /api/v2/email-templates/user_invitation` with Liquid syntax).
- New `GET /u2/accept-invitation` screen consumes the invite link, captures a password, creates the user with `email_verified: true`, adds them to the organization with the invite's roles, then signs them in.
- New `POST /api/v2/tickets/email-verification` and `POST /api/v2/tickets/password-change` endpoints that return one-time Auth0-compatible ticket URLs, consumed at `/u2/tickets/email-verification` and `/u2/tickets/password-change`.
