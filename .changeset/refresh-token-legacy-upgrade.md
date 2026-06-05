---
"authhero": patch
---

Extend the legacy refresh-token format cutoff from 2026-06-05 to 2026-08-04, and upgrade legacy rows in place on first non-rotating refresh.

Non-rotating clients never went through the rotation path, so rows minted before the 2026-05-05 rotation migration kept being served back as the same id-only wire token forever — `token_lookup`/`token_hash` stayed null and the cutoff would have logged them out. The non-rotating branch now mints a fresh `(lookup, secret)` on the next refresh of any legacy row, stamps the row, and returns the new `rt_<lookup>.<secret>` wire token to the client.
