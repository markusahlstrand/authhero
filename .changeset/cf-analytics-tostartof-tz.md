---
"@authhero/cloudflare-adapter": patch
---

Fix analytics queries failing with `toStartOfDay() function does not accept 2 arguments`. Cloudflare Analytics Engine's `toStartOf*` functions don't accept a timezone argument; the timezone is now applied via `toDateTime(..., tz)` instead.
