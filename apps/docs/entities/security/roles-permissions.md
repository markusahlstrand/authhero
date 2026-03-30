---
title: Roles & Permissions
description: How roles and permissions work in AuthHero for fine-grained access control.
---

# Roles & Permissions

Roles and permissions provide fine-grained access control using Role-Based Access Control (RBAC).

## Permissions

Permissions are specific scopes (like `read:users` or `write:posts`) defined on [Resource Servers](/entities/security/resource-servers). They represent actions that can be performed on your APIs.

Permissions can be assigned to users in two ways:
- **Directly** — Assign specific permissions to individual users
- **Via roles** — Assign a role that bundles multiple permissions

## Roles

Roles are named collections of permissions. Instead of assigning permissions one by one, create roles like:

| Role | Permissions |
| --- | --- |
| Viewer | `read:users`, `read:posts` |
| Editor | `read:users`, `read:posts`, `write:posts` |
| Admin | `read:users`, `write:users`, `read:posts`, `write:posts`, `delete:posts` |

### Global vs. Organization Roles

- **Global roles** — Apply everywhere the user authenticates
- **Organization roles** — Apply only when the user authenticates with that organization's context

The same user can be an Admin in one organization and a Viewer in another.

## Permission Resolution

When generating an access token, AuthHero combines permissions from all sources:

1. Direct user permissions
2. Global role permissions
3. Organization role permissions (if organization context is present)

The final set is the union of all sources.

For a complete guide on configuring RBAC, see [Security Model](/security/).
