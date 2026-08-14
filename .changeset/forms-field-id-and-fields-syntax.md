---
"authhero": minor
"@authhero/admin": minor
---

Forms: support the Auth0-standard `{{fields.<field_id>}}` syntax in flow templates (alongside the existing `{{$form.*}}` alias), and expose an editable Field ID in the form designer's field component editors so flows can reference readable IDs like `phone_number` instead of auto-generated ones.
