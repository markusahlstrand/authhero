---
"authhero": patch
---

`POST /api/v2/organizations/{id}/members` now validates every user id before adding anything. Unknown user ids return a 400 ("Some users do not exist") instead of surfacing a 500, and nothing from the batch is added. Re-adding an existing member is now a no-op even when the user also belongs to other organizations.
