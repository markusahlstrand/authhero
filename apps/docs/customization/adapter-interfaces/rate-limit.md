---
title: Rate Limit Adapter
description: Interface reference for the rate-limit adapter and the brute-force protection points it gates.
---

# Rate Limit Adapter

The `RateLimitAdapter` is an optional adapter on `DataAdapters` that provides short-window abuse protection for auth flows. AuthHero never ships rate limits in-band — the package is stateless by design, and short-window counters belong in a layer with shared, fast state (e.g. Cloudflare Workers Rate Limiter bindings, Redis, an upstream WAF). When this adapter is not configured, the auth flows skip throttling entirely; **deployments are expected to provide a rate-limit adapter, an upstream WAF, or both.**

## RateLimitAdapter Interface

```typescript
type RateLimitScope = "pre-login" | "pre-user-registration" | "brute-force";

interface RateLimitDecision {
  /** True if the request is allowed; false if the limit was exceeded. */
  allowed: boolean;
  /** Optional retry-after hint in seconds (omitted if the backend can't tell). */
  retryAfterSeconds?: number;
}

interface RateLimitAdapter {
  consume(scope: RateLimitScope, key: string): Promise<RateLimitDecision>;
}
```

The numeric threshold and window are **backend-specific** — the Cloudflare Workers Rate Limiter binding bakes them in at deploy time and cannot honor a per-tenant override. Callers that need per-tenant `max_attempts` must layer their own counter on top.

## Where AuthHero calls `consume`

| Scope | Key shape | Triggered by | When configured |
|---|---|---|---|
| `pre-login` | `${tenant_id}:${ip}` | Password grant pre-check ([`password.ts`](https://github.com/markusahlstrand/authhero/blob/main/packages/authhero/src/authentication-flows/password.ts)) | Honors `tenant.attack_protection.suspicious_ip_throttling.enabled` and its allowlist |
| `brute-force` | `passwordless:${tenant_id}:${normalized_username}` | Passwordless OTP verify — both `/oauth/token` (OTP grant) and `/passwordless/verify_redirect` ([`passwordless.ts`](https://github.com/markusahlstrand/authhero/blob/main/packages/authhero/src/authentication-flows/passwordless.ts)) | Always, when the adapter is present |
| `pre-user-registration` | — | Reserved for future use | — |

A `consume()` call that returns `{ allowed: false }` causes the auth flow to throw a `429 Too Many Requests` response.

## Fail-open behavior

If `consume()` throws (a misbehaving backend, a network blip, a misconfigured binding), the auth flow **logs the error and proceeds as if the call returned `{ allowed: true }`**. A broken rate-limit layer must never lock real users out of their accounts. Defense in depth (account lockout, post-failure tracking, upstream WAF rules) is expected to compensate.

## Not covered in-band

These vectors are intentionally **not** rate-limited by `RateLimitAdapter` inside the package — handle them at your edge / WAF:

- **`/passwordless/start`** — anyone can request an OTP code to be sent to an arbitrary email or phone. AuthHero does not throttle this in-band because the realistic abuse vector (an attacker spraying delivery costs onto your account) is better addressed by an upstream rate limiter that can see total request volume per IP/ASN, not just per `(tenant, identifier)`.
- **`/oauth/authorize`, `/oauth/token` (non-OTP grants), `/userinfo`** — standard OAuth endpoints. Use your edge layer (Cloudflare WAF, AWS WAF, an ingress rate limiter) for blanket request-rate protection.

## Tenant `attack_protection` settings

The `pre-login` check is gated by the tenant's `attack_protection.suspicious_ip_throttling` setting (manageable via the management API or the admin UI). When `enabled: false`, AuthHero skips the `consume()` call entirely — the binding is bypassed even if configured. IPs in the `allowlist` are also skipped. So enabling throttling end-to-end requires **both** a configured `RateLimitAdapter` and `suspicious_ip_throttling.enabled = true` on the tenant.

## Wiring it up on Cloudflare Workers

The `@authhero/cloudflare-adapter` package ships a built-in factory — you don't need to implement `RateLimitAdapter` by hand. Setup is three steps.

### 1. Declare the bindings in `wrangler.toml`

Each scope gets its own binding so limit and period can differ per scope. The Workers Rate Limiter only supports `period: 10` or `period: 60`.

```toml
[[unsafe.bindings]]
name = "RATE_LIMIT_PRE_LOGIN"
type = "ratelimit"
namespace_id = "1001"
simple = { limit = 30, period = 60 }

[[unsafe.bindings]]
name = "RATE_LIMIT_BRUTE_FORCE"
type = "ratelimit"
namespace_id = "1002"
simple = { limit = 10, period = 60 }

[[unsafe.bindings]]
name = "RATE_LIMIT_PRE_REGISTRATION"
type = "ratelimit"
namespace_id = "1003"
simple = { limit = 10, period = 60 }
```

Any scope you omit returns a permissive (`allowed: true`) decision — you can roll out one scope at a time.

### 2. Pass `rateLimitBindings` to `createAdapters`

`createAdapters` from `@authhero/cloudflare-adapter` accepts a `rateLimitBindings` field. When at least one binding is present it attaches a `rateLimit` adapter to the returned object; otherwise it stays `undefined`.

```typescript
import createCloudflareAdapters from "@authhero/cloudflare-adapter";

const cloudflare = createCloudflareAdapters({
  // ...other cloudflare config (customDomains, cache, logs, ...)
  rateLimitBindings: {
    "pre-login": env.RATE_LIMIT_PRE_LOGIN,
    "brute-force": env.RATE_LIMIT_BRUTE_FORCE,
    "pre-user-registration": env.RATE_LIMIT_PRE_REGISTRATION,
  },
});
```

### 3. Merge `rateLimit` into the data adapter passed to `app.fetch`

The auth flows read `env.data.rateLimit`, so the field needs to be on the data object you hand to `app.fetch(request, { ISSUER, data })`:

```typescript
import createKyselyAdapters from "@authhero/kysely-adapter";

const data = {
  ...createKyselyAdapters(db),
  ...cloudflare, // contributes rateLimit, customDomains, cache, ...
};

export default {
  fetch: (request: Request, env: Env) =>
    app.fetch(request, { ISSUER: env.ISSUER, data }),
};
```

Without this merge, `data.rateLimit` is `undefined` and the flows fail open silently.

## Implementing a custom backend

For non-Cloudflare deployments (Redis, an upstream WAF API, a Durable Object, etc.), implement `RateLimitAdapter` directly:

```typescript
const rateLimit: RateLimitAdapter = {
  async consume(scope, key) {
    // Look up your per-scope limit/window, increment your counter,
    // return { allowed, retryAfterSeconds? }.
  },
};

const data: DataAdapters = {
  ...createAdapters(db),
  rateLimit,
};
```

## Choosing keys

The key passed to `consume()` is the abuse-detection bucket. The current built-in keys are tuned for the most common attack patterns:

- **`brute-force`** uses `(tenant, username)` — guards the 6-digit OTP keyspace per victim, even from a distributed attacker.
- **`pre-login`** uses `(tenant, ip)` — guards the password-grant from a single source.

If your backend supports multi-key consumes, you can run both checks in your `consume()` implementation and reject if either is exceeded.
