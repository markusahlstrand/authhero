---
title: Security Model
description: AuthHero's security model — RBAC, scopes, permissions, management API security, and multi-tenant authorization.
---

# Security Model

AuthHero's security model follows the same patterns as Auth0, built on RBAC (Role-Based Access Control) with resource servers, scopes, roles, and permissions.

## Overview

The security model has three main aspects:

- **[RBAC, Scopes & Permissions](/security/rbac)** — How resource servers, scopes, roles, and permissions work together to control API access
- **[Management API Security](/security/management-api)** — How the Management API is authenticated and authorized
- **[Multi-Tenancy & Organizations](/security/multi-tenancy)** — How tenant isolation and organization-level authorization work

## Quick Reference

| Concept | Purpose |
| --- | --- |
| **Resource Server** | Represents an API. Defines available scopes. |
| **Scope** | A permission string like `read:users` |
| **Role** | A named group of permissions |
| **Permission** | A scope assigned to a user (directly or via role) |
| **Organization** | Groups users with their own roles and permissions |
| **RBAC** | When enabled, only granted scopes are included in tokens |

For a conceptual overview of each entity, see the [Entities](/entities/) section.
