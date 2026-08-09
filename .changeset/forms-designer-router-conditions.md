---
"authhero": patch
---

Accept router condition groups without a `type: "and"` discriminator and resolve bare field paths (e.g. `user_metadata.birthdate`) against the user in form router conditions. Both shapes were emitted by the admin forms designer and silently never matched.
