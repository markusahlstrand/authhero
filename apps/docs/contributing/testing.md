---
title: Testing
description: Testing guidelines for AuthHero using Vitest. Run tests, organize test files, and write unit and integration tests.
---

# Testing

This document outlines the testing guidelines for the AuthHero project.

## Testing Framework

AuthHero uses Vitest. `vitest.workspace.ts` at the repo root points at the
`vite.config.ts` of each project that participates in the workspace run, and
two things are deliberately outside it:

- **`packages/ui-widget`** uses Stencil's own test runner. Run it with
  `pnpm widget test`.
- **`packages/authhero/test/routes/`** holds legacy integration tests that are
  being migrated package by package. They still run as part of the `authhero`
  package's own suite, but are not picked up by the workspace config.

## Running Tests

Run every package's suite:

```bash
pnpm -r test
```

The root `pnpm test` script is a no-op placeholder — use `pnpm -r test`, or a
single package, instead.

Run tests for a specific project (the root `package.json` has a shortcut per
package):

```bash
pnpm authhero test
pnpm kysely test
pnpm admin test
```

Run a single test file, or a single test, from the package that owns it:

```bash
pnpm --filter authhero exec vitest run test/routes/auth-api/token.spec.ts
pnpm --filter authhero exec vitest run -t "<part of the test name>"
```

Adapter packages compile their type declarations for their consumers, so after
changing one, rebuild before running a dependent package's tests:

```bash
pnpm -r --filter './packages/**' build
```

## Test Structure

Tests should be organized in a way that mirrors the structure of the source code:

```
src/
  components/
    Button.tsx
    Button.test.tsx
```

## Writing Tests

### Unit Tests

Unit tests should test individual functions or components in isolation. They should be fast and have no external dependencies.

Example:

```typescript
import { describe, it, expect } from "vitest";
import { someFunction } from "./someFunction";

describe("someFunction", () => {
  it("should return the expected result", () => {
    const result = someFunction(input);
    expect(result).toBe(expectedOutput);
  });
});
```

### Integration Tests

Integration tests exercise several parts of the system together. In this
repository that usually means a real Hono app on top of a real (in-memory)
database rather than a mocked adapter:

```typescript
import { getTestServer } from "../helpers/test-server";

const { oauthApp, env } = await getTestServer();
const response = await oauthApp.request("/authorize?client_id=…", {}, env);
```

`getTestServer()` builds a SQLite-backed adapter with the migrations applied
and seeds a test tenant, so a test asserts on real HTTP responses and real
rows. Prefer this over asserting that an adapter method "was called": the
adapter contract is what the assertion should be about, not the call sequence.

Adapter packages (`kysely`, `drizzle`, `aws`) have the same shape of test one
level down — a migrated in-memory database, then the adapter methods against
it. `packages/kysely/test/helpers/test-server.ts` caches the migrated schema
image so each test gets a fresh database without re-running the migration
chain.

### End-to-End Tests

End-to-end tests drive AuthHero as a black box over real HTTP, with no
in-process shortcuts. They are slower and have external prerequisites, so they
are kept separate from the unit and integration suites:

- **Terraform provider** — `packages/authhero/test/terraform/terraform.spec.ts`
  boots the management API on a local HTTPS server and runs a real
  `terraform apply` against it with the Auth0 provider, then asserts on the
  resulting entities. It skips itself when the `terraform` binary is not on
  `PATH`, so it is a no-op on machines that do not have it.
- **OIDC conformance** — see the section below; the Playwright runner drives a
  local AuthHero through the OpenID Foundation suite in a browser.
- **Admin UI** — `apps/admin` has no browser-driven suite today; its tests are
  unit tests over the pure helpers (`src/**/*.test.ts`). Extract the logic you
  want to cover out of the component rather than reaching for a browser.

Write an end-to-end test when the thing you need to prove only exists once the
whole stack is assembled — a redirect chain, a cookie's attributes, a
standards-conformance claim. Everything else belongs in an integration test,
which is orders of magnitude faster.

### OIDC Conformance Tests

The `apps/conformance-runner` Playwright project drives the [OpenID Foundation conformance suite](https://gitlab.com/openid/conformance-suite) against a local AuthHero. See [Conformance Testing](/standards/conformance) for setup, what's covered, and how to interpret failures.

```bash
pnpm conformance:run                       # full Basic OP plan
pnpm conformance:run -- --grep oidcc-server # one module
```

## Mocking

The rule of thumb: **mock the edge of the process, not the code under test.**
Databases, email, and SMS all have adapter interfaces, so the real
implementation can be swapped for a recording one; only outbound HTTP has no
seam and needs a genuine mock.

### Adapters and services — use a test double, not `vi.mock`

`MockEmailService` and `MockSmsService` (`packages/authhero/test/helpers/`)
implement the real interface and record what they were asked to send, so a test
asserts on the message that would have gone out:

```typescript
const { oauthApp, env, getSentEmails } = await getTestServer();
// … drive the flow …
const [email] = getSentEmails();
expect(email.to).toBe("user@example.com");
```

Because they satisfy the same TypeScript interface as the real service, a
change to the adapter contract breaks them at compile time rather than leaving
a stale mock that silently passes.

### Outbound HTTP — `msw`

Packages that call third-party APIs use [msw](https://mswjs.io) to intercept at
the network layer, which keeps the request-building code under test. See
`packages/cloudflare/test/customDomains.spec.ts`:

```typescript
const server = setupServer(
  http.post("https://api.cloudflare.com/…", () => HttpResponse.json(mock)),
);
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

For a one-off call, `vi.spyOn(globalThis, "fetch")` is fine and is what most of
`packages/proxy` and the SSRF tests use. Reach for `msw` once a test needs more
than one endpoint or cares about request bodies.

### Time and randomness

Use `vi.useFakeTimers()` / `vi.setSystemTime()` for anything that asserts on
expiry, and remember to restore in `afterEach`. Do not stub `crypto` —
generated ids and codes are read back out of the database or the response
rather than predicted.

## Coverage

The project does **not** enforce a coverage percentage, and no coverage
threshold gates CI. Chasing a number tends to produce tests that execute code
without asserting anything about it. What is expected instead:

- **Every bug fix ships with a regression test** that fails before the fix.
  This is the one hard rule — a fix without one is how the same bug comes back.
- **Every new route gets at least one test through the real app**, not just its
  handler in isolation, so its middleware, validation, and error mapping are
  covered too.
- **Adapter changes are tested in every adapter that implements them.** A
  method added to `kysely` and forgotten in `drizzle` is a runtime failure for
  whoever swaps adapters, and the type system will not always catch it.
- **Anything security-relevant** — redirect validation, token validation,
  scopes, tenant isolation — gets a negative test as well as a positive one.
  Proving the request is rejected matters more than proving it is accepted.

To look at coverage locally, add `@vitest/coverage-v8` to the package you are
working in and run `pnpm --filter <package> exec vitest run --coverage`. Treat
the result as a map of what is untested, not as a target.
