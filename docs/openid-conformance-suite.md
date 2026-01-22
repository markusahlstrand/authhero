# OpenID Conformance Suite Testing

This guide explains how to run the [OpenID Foundation Conformance Suite](https://gitlab.com/openid/conformance-suite) against your local AuthHero environment.

## Prerequisites

- Docker and Docker Compose installed
- Git
- Node.js 18+
- Java 17+ (optional - can use Docker for build)

## Quick Start (Recommended)

The easiest way to run conformance tests is using `create-authhero` with the `--conformance` flag:

```bash
# 1. Create a new AuthHero project with conformance test clients
npx create-authhero my-conformance-test --template local --conformance

# Or with a custom alias for the conformance suite
npx create-authhero my-conformance-test --template local --conformance --conformance-alias my-test-alias

# 2. Start the AuthHero server
cd my-conformance-test
npm run dev

# 3. Set up the conformance suite (one-time, in another terminal)
git clone https://gitlab.com/openid/conformance-suite.git
cd conformance-suite
mvn clean package  # or use Docker: MAVEN_CACHE=./m2 docker-compose -f builder-compose.yml run builder
docker-compose up -d

# 4. Open https://localhost.emobix.co.uk:8443 in your browser
```

### Using package.json scripts (in the monorepo)

If you're working in the authhero monorepo, convenience scripts are available:

```bash
# Set up the conformance suite (one-time)
pnpm conformance:setup

# Start the conformance suite
pnpm conformance:start

# Stop the conformance suite
pnpm conformance:stop
```

### Test Clients

After setup, these test clients are available:

| Client ID         | Client Secret            |
| ----------------- | ------------------------ |
| conformance-test  | conformanceTestSecret123 |
| conformance-test2 | conformanceTestSecret456 |

The `create-authhero --conformance` command generates a `conformance-config.json` file that can be pasted into the conformance suite's JSON configuration tab.

---

## Alternative: Using the Demo App

You can also run conformance tests using the demo app in this monorepo:

```bash
# Delete existing database to get fresh conformance clients
rm apps/demo/db.sqlite

# Start the demo server (includes conformance clients)
pnpm demo dev

# In another terminal, start conformance suite
pnpm conformance:start
```

The demo app automatically creates conformance test clients when the database is first initialized.

---

## Manual Setup

If you prefer to set things up manually:

### 1. Start AuthHero Demo

First, ensure AuthHero is running locally:

```bash
# From the authhero root directory
pnpm demo dev
```

This starts AuthHero at `http://localhost:3000` (or the configured port in bun.ts).

### 2. Clone and Build the Conformance Suite

```bash
# Clone the conformance suite (outside the authhero directory)
cd ~/Projects
git clone https://gitlab.com/openid/conformance-suite.git
cd conformance-suite
```

#### Option A: Build with Docker (No Java Required)

```bash
# Build using Docker
MAVEN_CACHE=./m2 docker-compose -f builder-compose.yml run builder
```

#### Option B: Build with Local Java

```bash
# Requires Java 17+ and Maven
mvn clean package
```

### 3. Start the Conformance Suite

For macOS:

```bash
docker-compose -f docker-compose-dev-mac.yml up
```

For Linux:

```bash
docker-compose -f docker-compose-dev.yml up
```

The conformance suite will be available at `https://localhost:8443/`

> **Note**: You'll get a certificate warning. In Chrome on Mac, you can type `thisisunsafe` to bypass it. Alternatively, export the certificate and add it to your keychain.

### 4. Configure the Test

1. Visit `https://localhost:8443/`
2. Select "OIDCC: OpenID Provider Certification" test plan
3. Switch to the "JSON" tab
4. Paste the AuthHero configuration (see below)
5. Click "Start Test Plan"

## AuthHero Test Configuration

Use this configuration for testing against a local AuthHero instance:

```json
{
  "alias": "authhero-local",
  "description": "AuthHero Local Development",
  "server": {
    "discoveryUrl": "http://host.docker.internal:3000/.well-known/openid-configuration"
  },
  "client": {
    "client_id": "default",
    "client_secret": "clientSecret"
  },
  "client2": {
    "client_id": "conformance-client2",
    "client_secret": "conformanceSecret2"
  },
  "resource": {
    "resourceUrl": "http://host.docker.internal:3000/userinfo"
  }
}
```

### Important Notes

- `host.docker.internal` allows the Docker container to reach your local machine
- Make sure the client IDs and secrets match what's configured in AuthHero
- The discovery URL should return the OpenID Connect Discovery document

## Setting Up Additional Clients

You'll need to create additional clients in AuthHero for full conformance testing. Add these to your demo setup or run via API:

### Client 2 (for multi-client tests)

```typescript
await dataAdapter.clients.create("main", {
  client_id: "conformance-client2",
  client_secret: "conformanceSecret2",
  name: "Conformance Client 2",
  callbacks: [
    "https://localhost.emobix.co.uk:8443/test/a/authhero-local/callback",
  ],
  allowed_logout_urls: ["https://localhost.emobix.co.uk:8443/"],
  web_origins: ["https://localhost.emobix.co.uk:8443"],
});
```

## Callback URL Setup

For the conformance suite to work properly, configure these callback URLs in your AuthHero client:

```
https://localhost.emobix.co.uk:8443/test/a/authhero-local/callback
https://localhost:8443/test/a/authhero-local/callback
```

## Network Configuration

### Option 1: Using host.docker.internal (Recommended for Mac/Windows)

Docker Desktop on Mac and Windows automatically provides `host.docker.internal` to reach the host machine.

### Option 2: Using a Tunnel (For Full HTTPS)

If you need proper HTTPS and domain names:

1. Use ngrok or similar:

   ```bash
   ngrok http 3000
   ```

2. Update the conformance suite configuration with the ngrok URL

### Option 3: Local Hostname (localhost.emobix.co.uk)

The conformance suite uses `localhost.emobix.co.uk` which resolves to `127.0.0.1`. To use this:

1. Add to `/etc/hosts`:

   ```
   127.0.0.1 localhost.emobix.co.uk
   ```

2. Run AuthHero on port 443 (requires sudo or port forwarding):
   ```bash
   sudo -s ssh -L 443:localhost:3000 $USER@localhost -N
   ```

## Running Specific Test Plans

### OpenID Connect Core

1. Select "OIDCC: OpenID Provider Certification"
2. Configure as shown above
3. Run individual tests or the full suite

### FAPI 1.0 (Financial-grade API)

For FAPI testing, you'll need additional configuration:

```json
{
  "alias": "authhero-fapi",
  "description": "AuthHero FAPI Test",
  "server": {
    "discoveryUrl": "http://host.docker.internal:3000/.well-known/openid-configuration"
  },
  "client": {
    "client_id": "fapi-client",
    "client_secret": "fapiSecret"
  },
  "mtls": {
    "cert": "...",
    "key": "..."
  }
}
```

## Troubleshooting

### Conformance Suite Can't Reach AuthHero

1. Ensure AuthHero is running and accessible
2. Check that `host.docker.internal` resolves correctly
3. Try using your machine's local IP instead:
   ```json
   "discoveryUrl": "http://192.168.x.x:3000/.well-known/openid-configuration"
   ```

### Certificate Errors

The conformance suite uses self-signed certificates. Options:

1. In Chrome, type `thisisunsafe` when blocked
2. Export the certificate from Docker and add to your system trust store:
   ```bash
   docker exec -it conformance-suite-httpdlocal-1 cat /etc/ssl/certs/ssl-cert-snakeoil.pem > ~/Downloads/localhost-cert.pem
   ```
   Then import to Keychain Access and mark as trusted.

### Tests Failing with Redirect Errors

Ensure callback URLs are properly configured in both:

- AuthHero client configuration
- Conformance suite test configuration

### Discovery Document Issues

Verify your AuthHero instance returns a valid discovery document:

```bash
curl http://localhost:3000/.well-known/openid-configuration | jq
```

## Automated Testing

For CI/CD integration, you can run tests via command line:

```bash
# From conformance-suite directory
docker-compose -f docker-compose-localtest.yml run test
```

## Resources

- [Conformance Suite Wiki](https://gitlab.com/openid/conformance-suite/-/wikis/home)
- [OpenID Certification Instructions](https://openid.net/certification/instructions/)
- [Conformance Suite Build & Run Guide](https://gitlab.com/openid/conformance-suite/-/wikis/Developers/Build-&-Run)
