---
"@authhero/adapter-interfaces": minor
"authhero": patch
---

Add `actionResponseSchema` (and `actionSecretNameSchema`) to `@authhero/adapter-interfaces`: the action shape safe to return over HTTP, with secrets narrowed to `{ name }`. The management-API action and action-trigger-binding routes now declare their responses with it, so a secret `value` can no longer reach a response body — previously the handlers redacted at runtime but the OpenAPI schema still advertised and permitted `value`. `actionSchema` keeps `value`, since it describes the stored shape the code-hook executor reads at execution time.
