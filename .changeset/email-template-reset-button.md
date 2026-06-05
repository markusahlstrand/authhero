---
"@authhero/admin": patch
---

Replace the email-template Delete button with a "Reset to default" button that only appears when a tenant override exists. The action calls the same `DELETE /api/v2/email-templates/{templateName}` endpoint, then refreshes the form so it falls back to the bundled default pre-fill. Clarifies the affordance — there is nothing to "delete" when no override exists yet.
