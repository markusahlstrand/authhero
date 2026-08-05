---
"authhero": minor
---

Export `hashPassword` (the seed path's credential hasher) so provisioning
surfaces — the docker entrypoint, the Substrat auth-core worker — can upsert
admin credentials on an existing tenant with the exact hash `seed()` produces.
