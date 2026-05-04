# @authhero/conformance-runner

Playwright-driven runner for the OpenID Foundation conformance suite against AuthHero.

## What it does

1. Brings up the conformance suite (Docker) via `pnpm conformance:start`.
2. Reseeds `packages/create-authhero/auth-server/db.sqlite` via `pnpm conformance:seed`.
3. Starts the local auth-server on port 3000 (managed by Playwright's `webServer`).
4. Creates the `oidcc-basic-certification-test-plan` via the suite's REST API.
5. Runs every module in the plan as its own Playwright test, driving the AuthHero login form when a test is `WAITING` for browser interaction.
6. Asserts each module finishes with `PASSED` (or `WARNING` if `ALLOW_WARNING=1`).

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

## Environment variables

| Var | Default | Notes |
|---|---|---|
| `CONFORMANCE_BASE_URL` | `https://localhost.emobix.co.uk:8443` | Suite URL |
| `AUTHHERO_BASE_URL` | `https://localhost:3000` (or `http://localhost:3000` when `HTTPS_ENABLED=false`) | Auth-server URL (host-side) |
| `AUTHHERO_ISSUER` | `https://host.docker.internal:3000/` (or `http://...` when `HTTPS_ENABLED=false`) | Issuer published to the suite — must be reachable from inside the suite's Docker container |
| `HTTPS_ENABLED` | `true` | If `true` (the default), runs the auth-server over HTTPS using a self-signed cert generated into `packages/create-authhero/auth-server/.certs/`. Required by stricter plans (e.g. RP-initiated logout) that mandate `https://` for every endpoint in the discovery document. globalSetup automatically imports the cert into the conformance suite container's JRE truststore (alias `authhero-local`) and restarts the suite container so it trusts the chain. Set to `false` to fall back to plain HTTP. |
| `CONFORMANCE_USERNAME` | `admin` | Seeded user |
| `CONFORMANCE_PASSWORD` | `password2` | Seeded password |
| `CONFORMANCE_ALIAS` | `my-local-test` | Plan alias matching seeded callback URLs |
| `ALLOW_WARNING` | unset | If set, modules finishing with `WARNING` pass instead of fail |
| `SKIP_SETUP` | unset | If set, globalSetup skips `conformance:start`/`conformance:seed` (assumes already running). The cert-import step still runs when `HTTPS_ENABLED=true`. |

### HTTPS mode (default)

HTTPS is on by default. The first run generates a self-signed cert, imports it into the suite container's truststore, and restarts the suite container; subsequent runs are idempotent.

```sh
# Default — HTTPS enabled:
pnpm conformance:run

# Opt out (only the OIDC Basic plan; RP-initiated logout plans will fail):
HTTPS_ENABLED=false pnpm conformance:run
```

Regenerate the cert by deleting `packages/create-authhero/auth-server/.certs/` (and removing the `authhero-local` alias from the suite's truststore: `docker exec conformance-suite-server-1 keytool -delete -alias authhero-local -keystore /opt/java/openjdk/lib/security/cacerts -storepass changeit`).
