---
title: Admin Dashboard
description: Web-based management interface for AuthHero built with shadcn/ui and ra-core. Manage tenants, applications, connections, domains, users, branding, and logs.
---

# Admin Dashboard

The AuthHero Admin is a web-based management interface for AuthHero. It lets administrators manage tenants, applications, connections, domains, users, roles, branding and more — across one or many AuthHero deployments.

It is a single-page app built with **Vite + React 19**, **[shadcn/ui](https://ui.shadcn.com/)** components, **Tailwind v4** and **`ra-core`** (the headless half of react-admin). It lives in [`apps/admin`](https://github.com/markusahlstrand/authhero/tree/main/apps/admin) in the monorepo.

## Features

- Comprehensive tenant management
- Application configuration
- Connection setup and management
- Domain configuration
- User management and role assignment
- Branding (themes, universal-login template, logo/favicon)
- Log viewing and analysis
- Multi-domain switching (one admin, many AuthHero backends)
- Whitelabel via env vars (app name, logo, favicon)

## Getting Started

- [Installation](./installation.md) — Setup and configuration
- [Development](./development.md) — Development guide
- [Usage](./usage.md) — How to use the dashboard
