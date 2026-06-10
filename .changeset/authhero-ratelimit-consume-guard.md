---
"authhero": patch
---

Fix `TypeError: data.rateLimit.consume is not a function` (and similar errors for any class-based adapter) on universal-login and auth-api requests. The `addCaching` and `addTimingLogs` helpers iterated adapter methods via `Object.entries`, which skips prototype methods, so a class-based adapter like `CloudflareRateLimit` was wrapped as `{ bindings: ... }` with its `consume()` method silently stripped — causing every passwordless OTP and pre-login throttling call to throw. Both helpers now walk the prototype chain when enumerating methods, and `addTimingLogs` binds `this` to the original adapter so class methods that reference `this` keep working.
