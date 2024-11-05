# AuthHero

Monorepo for authhero containing the following packages:

- authhero. The main package for authhero that handles authentication and API requests.
- create-authhero, a CLI for creating authhero projects
- adapters:

  - adapter-interfaces, a package containing interfaces for creating adapters for authhero
  - kyssely
  - drizzle

It also contains the following apps:

- Manage, a web app for managing auth tenants
- Demo, a auth server using the kysely adapter and sqlite

## Getting Started

Get started by running the following commands:

```bash
pnpm install
pnpm dev
```
