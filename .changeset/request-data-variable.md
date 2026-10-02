---
"authhero": minor
---

Each request's adapter stack is now available as `ctx.var.data`. Use it in middleware, hooks and custom routes from now on.

`ctx.env.data` still works and points at the same object, so nothing breaks at runtime. It is deprecated and will be removed in a future major release. The stack belongs on the request rather than on `env` because Cloudflare Workers share one `env` object between all requests in an isolate, which is how concurrent requests ended up using each other's adapters in September.

`Variables` now has a required `data` field. Code that builds a `Variables` object by hand, for example a test mock, needs to add it.
