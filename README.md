# AuthHero

> 📚 For complete documentation, visit [authhero.net](https://authhero.net)

AuthHero is a multi-tenant authentication system that provides identity and access management services. This is the main monorepo containing all packages and applications.

## Packages

- **authhero** - The main package for AuthHero that handles authentication and API requests
- **create-authhero** - A CLI for creating new AuthHero projects
- **Adapters:**
  - `adapter-interfaces` - Interfaces for creating adapters for AuthHero
  - `kysely` - ORM adapter for SQL databases
  - `drizzle` - ORM adapter for SQL databases (experimental)
  - `cloudflare` - Custom domains support
  - `saml` - SAML authentication support

## Applications

- **react-admin** - Admin interface for managing tenants, users, applications, and more
- **auth0-proxy** - Proxy service for Auth0 compatibility
- **demo** - Demo authentication server using the kysely adapter and SQLite
- **docs** - Documentation site powered by VitePress

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher)
- [pnpm](https://pnpm.io/) (v10 or higher)

### Setting Up a New Project

The fastest way to get started is using the `create-authhero` CLI:

```bash
npm create authhero my-auth-project
cd my-auth-project
pnpm install
pnpm dev
```

This creates a new project with:

- SQLite database for local development
- Pre-configured authentication endpoints
- Example templates you can customize

### Using the Admin UI

To manage your authentication system, use the hosted admin interface:

1. Go to [manage.authhero.net](https://manage.authhero.net)
2. Create a tenant or connect to your local instance
3. Configure your applications, users, and authentication settings

## Development

### Local Setup

Clone and set up the monorepo for development:

```bash
git clone https://github.com/authhero/authhero.git
cd authhero
pnpm install
```

### Running the Demo

Start the demo authentication server:

```bash
pnpm demo dev
```

This starts a local auth server at `http://localhost:8787` with SQLite storage.

### Running All Apps

Start all apps in development mode:

```bash
pnpm dev
```

This starts:

- Demo auth server
- React admin interface
- Documentation site
- All other apps in parallel

### Running Specific Apps

Use these shortcuts to work with individual apps:

```bash
pnpm demo          # Work with demo app
pnpm react-admin   # Work with admin interface
pnpm authhero      # Work with main package
pnpm vitepress     # Work with docs
```

### Running OIDC Conformance Tests

AuthHero is tested against the [OpenID Foundation conformance suite](https://gitlab.com/openid/conformance-suite) via [`apps/conformance-runner`](apps/conformance-runner/), a Playwright-driven runner that boots the suite, seeds a local auth-server, and runs the `oidcc-basic-certification-test-plan`.

**One-time setup:**

1. Clone the conformance suite into `~/conformance-suite` (the scripts expect this path).
2. Add the suite's hostname to `/etc/hosts`:
   ```
   127.0.0.1   localhost.emobix.co.uk
   ```
3. Install Playwright's Chromium browser:
   ```bash
   pnpm --filter @authhero/conformance-runner exec playwright install chromium
   ```

**Run the suite** from the repo root:

```bash
pnpm conformance:start          # bring up the suite via Docker
pnpm conformance:run            # run the full plan
pnpm conformance:run -- --grep "discovery"   # run a single module
pnpm conformance:report         # open the last HTML report
pnpm conformance:stop           # tear down the suite
```

See [apps/conformance-runner/README.md](apps/conformance-runner/README.md) for environment variables and advanced options.

## Contributing

We welcome contributions! Here's how to get started:

### Making Changes

1. Create a new branch for your changes:

   ```bash
   git checkout -b feature/my-feature
   ```

2. Make your changes and ensure tests pass:

   ```bash
   pnpm test
   ```

3. Format your code:
   ```bash
   pnpm format
   ```

### Creating a Changeset

AuthHero uses [Changesets](https://github.com/changesets/changesets) for version management. When you make changes that should be included in the changelog, create a changeset:

```bash
pnpm changeset
```

This will prompt you to:

1. **Select packages** - Choose which packages are affected by your changes
2. **Select version bump type:**
   - **Patch** (0.0.x) - Bug fixes, documentation updates, non-breaking changes
   - **Minor** (0.x.0) - New features, non-breaking additions
   - **Major** (x.0.0) - Breaking changes that require users to modify their code
3. **Describe your changes** - Write a summary that will appear in the changelog

The changeset will be saved as a markdown file in `.changeset/` and should be committed with your changes.

**Example:**

```bash
$ pnpm changeset
🦋  Which packages would you like to include? › authhero
🦋  What kind of change is this for authhero? › minor
🦋  Please enter a summary for this change:
    Added support for custom email templates
```

### Submitting a Pull Request

1. Push your branch to GitHub
2. Open a pull request with:
   - Clear description of changes
   - Any relevant issue numbers
   - Your changeset(s) included
3. Wait for review and CI checks to pass

### Release Process

Releases are automated via GitHub Actions when changesets are merged to the main branch. The process:

1. Changesets are collected on each PR
2. After merge, a "Version Packages" PR is automatically created
3. When the Version Packages PR is merged, packages are published to npm

## Project Structure

```
authhero/
├── apps/
│   ├── auth0-proxy/      # Auth0 compatibility proxy
│   ├── demo/             # Demo auth server
│   ├── docs/             # Documentation site
│   └── react-admin/      # Admin interface
├── packages/
│   ├── adapter-interfaces/
│   ├── authhero/         # Main package
│   ├── cloudflare/
│   ├── create-authhero/  # Project generator CLI
│   ├── drizzle/
│   ├── kysely/
│   └── saml/
└── test/                 # Integration tests
```

## Resources

- 🌐 [Documentation](https://authhero.net)
- 🎛️ [Admin Interface](https://manage.authhero.net)
- 🐛 [Issue Tracker](https://github.com/authhero/authhero/issues)
- 💬 [Discussions](https://github.com/authhero/authhero/discussions)

## License

[MIT License](LICENSE)
