---
"@authhero/admin": minor
---

Add an Email Templates page under Branding, matching Auth0's dashboard structure. Lists all 12 supported templates (`verify_email`, `verify_email_by_code`, `reset_email`, `reset_email_by_code`, `welcome_email`, `user_invitation`, `blocked_account`, `stolen_credentials`, `enrollment_email`, `mfa_oob_code`, `change_password`, `password_reset`) with a Customized / Default / Disabled badge per row.

The per-template editor exposes `enabled`, `from`, `subject`, and a Monaco-based HTML + Liquid body editor, with a live preview pane on the right that re-renders the Liquid template against sample tenant/branding/user variables as you type. Saving upserts the override via PUT `/api/v2/email-templates/{templateName}`; templates without an override remain on the bundled default until first save.

Adds `liquidjs` as a runtime dependency for client-side preview rendering.
