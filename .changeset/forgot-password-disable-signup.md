---
"authhero": patch
---

Fix a raw JSON error on the reset-password request page when signups are disabled and the email has no existing user. The forgot-password flow no longer eagerly creates a user (which threw the signup-disabled hook); instead it only creates one when signups are still permitted, and otherwise silently renders the same screen so the request can't be used to enumerate accounts.
