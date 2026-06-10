---
"@authhero/multi-tenancy": patch
"@authhero/admin": patch
---

Add a Danger zone to the tenant settings Advanced tab with a confirmation-gated delete button, hide the default delete button at the top of the settings edit page, and fix the access check on `DELETE /tenants/{id}` so tokens carrying an `org_name` claim that matches the target tenant pass without a redundant control-plane membership lookup (which was rejecting valid org-scoped tokens).
