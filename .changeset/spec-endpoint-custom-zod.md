---
"@authhero/adapter-interfaces": patch
---

Fix `GET /api/v2/spec` returning 500. The connection schema declared `response_type`/`response_mode` as bare `z.custom()`, which Zod v4 emits as an unserializable `custom` check. `.doc("/spec")` regenerates the whole OpenAPI document on each request, so this single schema broke the entire endpoint. Switched both fields to `z.nativeEnum(...)`, matching how these enums are already declared in `AuthParams`.
