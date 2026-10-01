---
"authhero": minor
"@authhero/kysely-adapter": patch
"@authhero/drizzle": patch
"@authhero/aws-adapter": patch
---

Expose the original authorization URL to post-login Actions and webhooks so they can read UTM and attribution parameters. Preserve full authorization URLs in the login-session adapters now that SQL stores them as text.
