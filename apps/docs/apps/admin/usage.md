---
title: Admin Usage
description: Use the AuthHero Admin Dashboard to manage tenants, applications, connections, domains, users, branding and logs.
---

# Admin Dashboard Usage

## Logging In

On first load, the admin asks for the AuthHero **domain** (your tenant URL). The choice is stored in a cookie so subsequent visits skip the picker. To skip the picker entirely, deploy with `VITE_AUTH0_DOMAIN` set, or inject `window.__AUTHHERO_ADMIN_CONFIG__.domain`.

After picking a domain, the admin redirects you through `@auth0/auth0-spa-js` to authenticate against that AuthHero deployment. Once authenticated you land on `/tenants`.

## Managing Tenants

Tenants are isolated environments within your AuthHero deployment. Each tenant has its own applications, connections, users, roles and branding.

- **`/tenants`** — list and switch between tenants you can administer
- **`/tenants/create`** — create a new tenant (requires the management API permission)
- **`/:tenantId/`** — per-tenant dashboard; the top bar shows a tenant switcher

## Managing Applications

Applications represent OAuth clients that use AuthHero for authentication.

- Browse from the **Applications** sidebar entry
- Each application has tabs for general settings, allowed callback / logout URLs, web origins, grant types and connection toggles

## Managing Connections

Connections are the identity sources users authenticate with — username/password databases, social providers (Google, GitHub, Apple…), enterprise SSO (OIDC, SAML).

- **Database connections** — configure password policies and signup behavior
- **Social connections** — provide the upstream provider's client ID and secret
- **Enterprise connections** — configure SAML or OIDC and assign which applications can use them

## Managing Domains

Add custom domains to a tenant. Each custom domain can have its own certificate and is bound to a single tenant.

## Managing Users

- Search and filter users by email, username or identifier
- Open a user to view their profile, identities, MFA factors, sessions and audit log
- Trigger password resets, send verification emails, link/unlink identities, revoke sessions

## Managing Roles & Permissions

- Define **resource servers** (APIs) and the **permissions** they expose
- Define **roles** that bundle permissions
- Assign roles to users or organizations

## Branding & Whitelabeling

Two layers of branding:

- **Tenant branding** (per-tenant, stored in the database) — configure logo, colors, theme, universal-login template from the **Branding** sidebar entry. This affects what end users see during login.
- **Portal branding** (per-deployment, via env vars) — `VITE_APP_NAME`, `VITE_APP_LOGO_URL`, `VITE_APP_FAVICON_URL` change the admin UI itself. See [Installation → Whitelabeling](./installation.md#whitelabeling).

## Viewing Logs

The **Logs** sidebar entry shows audit and authentication events for the current tenant. Click a row to inspect the full event payload.
