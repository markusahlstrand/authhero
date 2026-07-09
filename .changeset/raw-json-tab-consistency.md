---
"@authhero/admin": patch
---

Add a consistent "Raw JSON" tab to admin detail screens that were missing it: sessions, email providers, email templates, flows, resource server scopes, resource servers, settings, actions, attack protection, branding, MFA, and prompts.

Consolidate the redundant read-only session edit view into the session show view (sessions are now viewed via `/sessions/:id/show`).
