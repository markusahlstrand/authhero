---
"@authhero/adapter-interfaces": patch
"authhero": patch
---

Return masked hints for connection secrets

Connection responses still omit `client_secret`, `app_secret` and
`twilio_token`, but now include a sibling `<field>_hint` holding a masked
preview (e.g. `3a9f••••••••`) so a UI can show that a secret is set — and which
one — without exposing it. Secrets shorter than 16 characters are masked
without a prefix, and the mask is a fixed width so it doesn't leak the real
length. The same applies to the nested upstream migration secret at
`options.configuration.client_secret`, which was previously returned in full.

Hints are response-only: they are dropped from POST/PATCH bodies, as are blank
secret values, so a client that echoes a record back can neither persist a mask
nor wipe a stored secret with an empty string. A secret consequently can't be
cleared by sending `""` — set a new value instead.

Connection secrets are also no longer written to the audit log in plaintext;
log entity state and request bodies go through the same redaction.
