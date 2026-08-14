---
"authhero": patch
---

Fix broken "verify your email" links after email/password signup

The post-signup verification email linked to `/u/validate-email` with no
`state`/`code` query params (and no email_verification code was ever minted
for the flow), so every click ended in a raw ZodError JSON response.

The email now mints a single-use ticket and links to the session-less
`/u2/tickets/email-verification` endpoint — the same mechanism as the
management API's `POST /api/v2/tickets/email-verification` — which works
even when the link is opened later or on another device. The legacy
`/u/validate-email` page now renders the branded error page instead of raw
Zod JSON when the params are missing.
