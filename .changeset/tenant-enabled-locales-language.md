---
"authhero": patch
---

Honour the tenant's `enabled_locales` when resolving the universal-login language. Previously the setting was stored but never read: u2 pages, the screen API, the classic /u flow, and emails picked the language from `ui_locales` and `Accept-Language` only, so a tenant configured with e.g. only `nb` still rendered English. Requested languages outside `enabled_locales` are now ignored and the first enabled locale is the fallback instead of English (Auth0 semantics). The u2 language picker now only offers enabled locales.
