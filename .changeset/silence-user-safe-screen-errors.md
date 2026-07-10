---
"authhero": patch
---

Stop logging user-safe validation errors at error level in universal-login screens. Expected client errors such as a reused/expired email OTP code ("code already used") or an invalid MFA phone enrollment no longer emit `console.error` to Cloudflare observability — they are still surfaced to the user and recorded in the tenant logs. Only genuinely unexpected failures (5xx / delivery errors) are logged as errors.
