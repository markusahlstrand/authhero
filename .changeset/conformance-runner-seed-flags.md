---
"create-authhero": minor
---

Generated local seed.ts now accepts `--clients` and `--user-profile` JSON flags for setting up additional clients and a populated user profile (used by the OIDC conformance suite). When generated with `--conformance`, the seed also sets the tenant `default_audience` so the OIDCC `/token` endpoint can issue access tokens without a per-request audience.
