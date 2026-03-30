---
title: Entities
description: The core data entities in AuthHero — users, tenants, applications, connections, organizations, tokens, and more.
---

# Entities

AuthHero manages several core entities, organized into three domains:

## Identity

Entities that represent people and groups:

- **[Users](/entities/identity/users)** — The individuals who authenticate. Each user belongs to a tenant and can have multiple identities (linked accounts).
- **[Organizations](/entities/identity/organizations)** — Groups of users with their own roles, permissions, and branding. Essential for B2B applications.

## Configuration

Entities that control how authentication works:

- **[Tenants](/entities/configuration/tenants)** — The top-level isolation boundary. Each tenant has its own users, applications, and settings.
- **[Applications](/entities/configuration/applications)** — Client applications (SPAs, APIs, native apps) that use AuthHero for authentication.
- **[Connections](/entities/configuration/connections)** — Authentication methods available to users: email/password, social logins, SAML, and more.
- **[Domains](/entities/configuration/domains)** — Custom domains for branded authentication URLs.

## Security

Entities that control access and authorization:

- **[Resource Servers](/entities/security/resource-servers)** — Represent your APIs. Define the scopes (permissions) available for each API.
- **[Tokens](/entities/security/tokens)** — ID tokens, access tokens, and refresh tokens issued during authentication.
- **[Roles & Permissions](/entities/security/roles-permissions)** — Named collections of permissions that can be assigned to users globally or per-organization.
