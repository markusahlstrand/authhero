---
"authhero": patch
---

Write the management API's CORS headers from a single helper so the preflight response and the actual response can no longer drift apart. Also stops `Vary: Origin` being appended twice on ordinary responses.
