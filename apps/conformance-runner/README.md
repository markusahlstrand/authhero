# @authhero/conformance-runner

Playwright-driven runner for the OpenID Foundation conformance suite against AuthHero.

## What it does

1. **Wipes and re-scaffolds `apps/conformance-auth-server/`** (gitignored) so every run starts from a pristine auth-server. Runs the workspace-root `pnpm install` to wire up `workspace:*` deps.
2. Pre-generates a self-signed cert into `apps/conformance-auth-server/.certs/` if missing.
3. Brings up the conformance suite (Docker) via `pnpm conformance:start`.
4. Reseeds `apps/conformance-auth-server/db.sqlite` via `pnpm conformance:seed`.
5. Starts the local auth-server on port 3000 (managed by Playwright's `webServer`, never reused — fresh process per run).
6. Creates each plan via the suite's REST API.
7. Runs every module in the plan as its own Playwright test, driving the AuthHero login form when a test is `WAITING` for browser interaction.
8. Asserts each module finishes with `PASSED`, `REVIEW`, or `SKIPPED` (or `WARNING` if `ALLOW_WARNING=1`).

## One-time setup

```sh
# /etc/hosts must contain (the conformance suite expects this):
# 127.0.0.1   localhost.emobix.co.uk

pnpm install
pnpm --filter @authhero/conformance-runner exec playwright install chromium
```

## Run

From the repo root:

```sh
pnpm conformance:run            # full plan
pnpm conformance:run -- --ui    # interactive Playwright UI
pnpm conformance:report         # open the last HTML report
```

Run a single module with `--grep`:

```sh
pnpm conformance:run -- --grep "discovery"
```

Run a single plan's tests with Playwright's filename filter:

```sh
pnpm conformance:run -- tests/oidcc-config.spec.ts
```

The runner currently drives nine plans, each in its own spec file:

- `oidcc-basic-certification-test-plan` ([oidcc-basic.spec.ts](tests/oidcc-basic.spec.ts))
- `oidcc-formpost-basic-certification-test-plan` ([oidcc-form-post-basic.spec.ts](tests/oidcc-form-post-basic.spec.ts))
- `oidcc-implicit-certification-test-plan` ([oidcc-implicit.spec.ts](tests/oidcc-implicit.spec.ts)) — `response_type` is pinned per-module by the plan; status TBD until first green run
- `oidcc-formpost-implicit-certification-test-plan` ([oidcc-form-post-implicit.spec.ts](tests/oidcc-form-post-implicit.spec.ts)) — implicit profile with `response_mode=form_post`; `response_type` pinned per-module by the plan; status TBD until first green run
- `oidcc-hybrid-certification-test-plan` ([oidcc-hybrid.spec.ts](tests/oidcc-hybrid.spec.ts)) — hybrid flow (`code id_token`, `code token`, `code id_token token`); `response_type` pinned per-module by the plan; status TBD until first green run
- `oidcc-formpost-hybrid-certification-test-plan` ([oidcc-form-post-hybrid.spec.ts](tests/oidcc-form-post-hybrid.spec.ts)) — hybrid profile with `response_mode=form_post`; `response_type` pinned per-module by the plan; status TBD until first green run
- `oidcc-rp-initiated-logout-certification-test-plan` ([oidcc-rp-initiated-logout.spec.ts](tests/oidcc-rp-initiated-logout.spec.ts))
- `oidcc-config-certification-test-plan` ([oidcc-config.spec.ts](tests/oidcc-config.spec.ts)) — pure metadata verification (discovery + JWKS), no browser flow
- `oidcc-dynamic-certification-test-plan` ([oidcc-dynamic.spec.ts](tests/oidcc-dynamic.spec.ts)) — basic flow with `client_registration=dynamic_client`; suite registers its own client via `/oidc/register`. Requires the conformance tenant to have `enable_dynamic_client_registration=true` (set automatically by `create-authhero --conformance`). Status TBD until first green run

## Environment variables

| Var | Default | Notes |
|---|---|---|
| `CONFORMANCE_BASE_URL` | `https://localhost.emobix.co.uk:8443` | Suite URL |
| `AUTHHERO_BASE_URL` | `https://localhost:3000` (or `http://localhost:3000` when `HTTPS_ENABLED=false`) | Auth-server URL (host-side) |
| `AUTHHERO_ISSUER` | `https://host.docker.internal:3000/` (or `http://...` when `HTTPS_ENABLED=false`) | Issuer published to the suite — must be reachable from inside the suite's Docker container |
| `HTTPS_ENABLED` | `true` | If `true` (the default), runs the auth-server over HTTPS using a self-signed cert generated into `apps/conformance-auth-server/.certs/`. Required by stricter plans (e.g. RP-initiated logout, config) that mandate `https://` for every endpoint in the discovery document. globalSetup automatically imports the cert into the conformance suite container's JRE truststore (alias `authhero-local`) and restarts the suite container so it trusts the chain. Set to `false` to fall back to plain HTTP. |
| `CONFORMANCE_USERNAME` | `admin` | Seeded user |
| `CONFORMANCE_PASSWORD` | `password2` | Seeded password |
| `CONFORMANCE_ALIAS` | `my-local-test` | Plan alias matching seeded callback URLs |
| `ALLOW_WARNING` | unset | If set, modules finishing with `WARNING` pass instead of fail |
| `SKIP_SETUP` | unset | If set, `prepareAuthServer()` (which runs at `playwright.config.ts` module-load time, before `globalSetup`) skips scaffold + `conformance:start` + `conformance:seed` and skips cert generation (assumes the auth-server already exists, the suite is already running, and certs are already on disk). The cert-import step in `globalSetup` still runs when `HTTPS_ENABLED=true`. When troubleshooting setup failures, inspect `prepareAuthServer()` and the config-load path — not `globalSetup`. |

### Auth-server lifecycle

`apps/conformance-auth-server/` is regenerated from the `create-authhero` `local` template at the start of every run. It is gitignored and exists purely to support the conformance suite. Don't edit it manually — your changes will be wiped on the next run. If the scaffolder itself changes (e.g. a new dep), make sure `pnpm --filter create-authhero build` has been run so `dist/create-authhero.js` is current.

### HTTPS mode (default)

HTTPS is on by default. Because `apps/conformance-auth-server/` is wiped at the start of every run, `prepareAuthServer()` (invoked at `playwright.config.ts` module-load, before `globalSetup`) pre-generates a fresh self-signed cert (via `openssl`) on every run; `globalSetup` then imports it into the suite container's truststore and restarts the suite container. The truststore comparison short-circuits the docker restart when the on-disk cert matches the stored alias, so back-to-back runs without code changes don't pay the restart cost twice.

```sh
# Default — HTTPS enabled:
pnpm conformance:run

# Opt out (only the OIDC Basic plan; RP-initiated logout / config plans will fail):
HTTPS_ENABLED=false pnpm conformance:run
```

To force a fresh cert without a full rescaffold, delete `apps/conformance-auth-server/.certs/` and remove the `authhero-local` alias from the suite's truststore:

```sh
docker exec conformance-suite-server-1 keytool -delete \
  -alias authhero-local \
  -keystore /opt/java/openjdk/lib/security/cacerts \
  -storepass changeit
```
