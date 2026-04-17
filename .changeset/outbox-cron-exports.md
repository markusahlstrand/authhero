---
"authhero": minor
---

Expose cron-style helpers for scheduled handlers: `drainOutbox`, `cleanupOutbox`, and a context-free `cleanupSessions`. These can be wired directly into a Cloudflare Worker `scheduled()` handler (or any cron) to process pending outbox events and delete events past the retention window.
