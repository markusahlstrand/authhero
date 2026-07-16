---
"authhero": patch
---

Return 400 instead of 500 for `POST /api/v2/users` requests sent without a body

The route declared its request body without `required: true`, so `@hono/zod-openapi` installed its optional-body middleware, which only runs the zod validator when a `Content-Type` header is present. A request with no body and no `Content-Type` therefore skipped validation entirely and reached the handler with `{}`, failing later at the database layer with a NOT NULL constraint violation and surfacing as a generic 500. Marking the body as required makes the validator run unconditionally and reject such requests with a 400.
