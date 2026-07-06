---
title: Database Schema
description: Documentation of AuthHero's database schema for multi-tenant authentication, including tables, relationships, and entity diagrams.
---

# Database Schema

AuthHero uses a multi-tenant database schema where almost every table is scoped by `tenant_id`. This page documents the schema as defined by the primary [Drizzle adapter](/customization/drizzle/) — the authoritative source is [`packages/drizzle/src/schema/sqlite/`](https://github.com/markusahlstrand/authhero/tree/main/packages/drizzle/src/schema/sqlite). The Kysely adapter implements the same logical model.

Rather than one giant diagram, the schema is presented one domain at a time. Wide tables (`tenants`, `clients`, `themes`, `logs`) show their identity and relationship columns plus the most important attributes; settings-style columns are elided for readability — see the schema source for the full column lists.

## Tenants, Clients, and Domains

The `tenants` table is the root of the hierarchy. Clients (OAuth/OIDC applications, called `applications` in older versions) and custom domains hang directly off it.

```mermaid
erDiagram
    tenants {
        text id PK
        text name
        text audience
        text sender_email
        text language
        integer session_lifetime
        integer idle_session_lifetime
        text flags "JSON"
        text created_at
        text updated_at
    }

    clients {
        text client_id PK
        text tenant_id PK,FK
        text name
        text client_secret
        text app_type
        text callbacks "JSON array"
        text allowed_logout_urls "JSON array"
        text web_origins "JSON array"
        text grant_types "JSON array"
        text jwt_configuration "JSON"
        text refresh_token "JSON"
        text connections "JSON array"
        text owner_user_id "set for DCR clients"
        text created_at
        text updated_at
    }

    client_grants {
        text id PK
        text tenant_id PK,FK
        text client_id FK
        text audience
        text scope "JSON array"
        text subject_type
        text created_at
        text updated_at
    }

    client_registration_tokens {
        text id PK
        text tenant_id FK
        text token_hash
        text type
        text client_id FK
        integer expires_at_ts
        integer created_at_ts
    }

    connections {
        text id PK
        text tenant_id PK,FK
        text name
        text strategy
        text options "JSON"
        text display_name
        integer is_system
        text created_at
        text updated_at
    }

    custom_domains {
        text custom_domain_id PK
        text tenant_id FK
        text domain UK
        integer primary
        text status
        text type
        text tls_policy
        text created_at
        text updated_at
    }

    proxy_routes {
        text id PK
        text tenant_id
        text custom_domain_id FK
        integer priority
        text match "JSON"
        text handlers "JSON array"
    }

    domains {
        text id PK
        text tenant_id FK
        text domain
        text email_service
        text dkim_public_key
    }

    tenants ||--o{ clients : "has many"
    tenants ||--o{ client_grants : "has many"
    tenants ||--o{ client_registration_tokens : "has many"
    tenants ||--o{ connections : "has many"
    tenants ||--o{ custom_domains : "has many"
    tenants ||--o{ domains : "has many"
    clients ||--o{ client_grants : "grants for"
    custom_domains ||--o{ proxy_routes : "routes for"
```

- **`tenants`** — the root table for multi-tenancy. Alongside branding and session-lifetime settings it also carries provisioning metadata (`deployment_type`, `provisioning_state`, `worker_version`, `d1_database_id`, …) used by the [tenant lifecycle operations](#control-plane-tables) machinery.
- **`clients`** — OAuth/OIDC client applications, mirroring the Auth0 client shape. Most complex configuration (JWT settings, refresh-token policy, addons, native social login) is stored as JSON text columns. `owner_user_id` and `registration_type` support Dynamic Client Registration.
- **`client_grants`** — client-credentials grants: which client may get machine-to-machine tokens for which API (`audience`) with which scopes.
- **`client_registration_tokens`** — hashed initial-access / registration-access tokens for Dynamic Client Registration.
- **`connections`** — identity providers (email, SMS, social, SAML, OIDC, …) configured per tenant; provider specifics live in the JSON `options` column.
- **`custom_domains`** — white-label domains with verification status and TLS policy. **`proxy_routes`** attach path-based routing rules (used by `@authhero/proxy`) to a custom domain.
- **`domains`** — legacy per-tenant email/DKIM domain configuration.

## Users and Credentials

```mermaid
erDiagram
    users {
        text user_id PK
        text tenant_id PK,FK
        text email
        text phone_number
        text username
        text provider
        text connection
        boolean email_verified
        boolean is_social
        text linked_to FK "primary user_id when linked"
        text app_metadata "JSON"
        text user_metadata "JSON"
        text profileData "JSON"
        text created_at
        text updated_at
    }

    user_activity {
        text tenant_id PK,FK
        text user_id PK,FK
        text last_login
        text last_ip
        integer login_count
        text failed_logins "JSON array"
        text last_password_reset
    }

    passwords {
        text id PK
        text tenant_id FK
        text user_id FK
        text password "hash"
        text algorithm
        integer is_current
        text created_at
    }

    authentication_methods {
        text id PK
        text tenant_id FK
        text user_id FK
        text type "totp | webauthn | phone ..."
        text totp_secret
        text credential_id "WebAuthn"
        text public_key "WebAuthn"
        integer confirmed
        integer created_at_ts
    }

    grants {
        text id PK
        text tenant_id FK
        text user_id FK
        text client_id FK
        text audience
        text scope "JSON array"
        text created_at
    }

    users ||--o| user_activity : "login counters"
    users ||--o{ passwords : "password history"
    users ||--o{ authentication_methods : "MFA factors"
    users ||--o{ grants : "consented scopes"
    users ||--o{ users : "linked accounts"
```

- **`users`** — user profiles keyed by `(user_id, tenant_id)`. One identity per row: linked accounts point at their primary profile via `linked_to`. Standard OIDC profile claims (name, locale, address, …) are individual columns; free-form data goes in `app_metadata` / `user_metadata`.
- **`user_activity`** — write-often login counters (`last_login`, `last_ip`, `login_count`, failed-login lockout timestamps) split out of `users` so the profile row isn't rewritten on every login.
- **`passwords`** — password hashes with algorithm tag; multiple rows per user form a history, with `is_current` marking the active one.
- **`authentication_methods`** — enrolled MFA factors: TOTP secrets, WebAuthn credentials (public key, sign count, transports), and phone numbers.
- **`grants`** — per `(user, client, audience)` OAuth consent grants backing the consent screen and the `/grants` management endpoints.

## Authentication Flow and Sessions

The login flow creates a `login_session`, which on success is promoted into a long-lived `session`; refresh tokens and authorization codes reference back to it.

```mermaid
erDiagram
    login_sessions {
        text id PK
        text tenant_id PK,FK
        text session_id FK "set once promoted"
        text csrf_token
        text auth_params "JSON, canonical"
        text state "pending | authenticated | ..."
        text user_id FK
        text auth_connection
        text ip
        text useragent
        integer created_at_ts
        integer expires_at_ts
    }

    sessions {
        text id PK
        text tenant_id PK,FK
        text user_id FK
        text login_session_id FK
        text device "JSON"
        text clients "JSON array"
        integer authenticated_at_ts
        integer expires_at_ts
        integer idle_expires_at_ts
        integer revoked_at_ts
    }

    refresh_tokens {
        text id PK
        text tenant_id PK,FK
        text client_id FK
        text login_id FK "login_session id"
        text user_id FK
        text resource_servers "JSON array"
        boolean rotating
        text token_hash
        text family_id "rotation family"
        text rotated_to
        integer expires_at_ts
        integer idle_expires_at_ts
        integer revoked_at_ts
    }

    codes {
        text code_id PK
        text code_type PK "authorization_code | password_reset | ..."
        text tenant_id FK
        text user_id FK
        text login_id FK
        text code_challenge "PKCE"
        text code_challenge_method "PKCE"
        text redirect_uri
        text expires_at
        text used_at
    }

    login_sessions ||--o| sessions : "promoted to"
    sessions ||--o{ refresh_tokens : "issued under"
    login_sessions ||--o{ codes : "issued during"
    login_sessions ||--o{ refresh_tokens : "issued from"
```

- **`login_sessions`** — one row per authentication attempt. The OAuth authorization parameters live in the JSON `auth_params` column (the legacy hoisted `authParams_*` columns were dropped). `state` tracks the flow (`pending` → `authenticated` / `failed`), and CSRF token, IP, and user agent support flow security.
- **`sessions`** — authenticated browser sessions with absolute and idle expiration, the device fingerprint, and the list of clients that have used the session (single sign-on).
- **`refresh_tokens`** — supports rotating refresh tokens: tokens are stored hashed (`token_hash`), rotation chains share a `family_id`, and `rotated_to` links each token to its successor so reuse of a stale token can revoke the whole family.
- **`codes`** — short-lived one-time codes keyed by `(code_id, code_type)`: authorization codes (with PKCE challenge), email verification, password reset, and similar.

Three older single-purpose stores — `authentication_codes`, `otps`, and `tickets` — still exist for backwards compatibility and hold the same kind of short-lived flow state.

## Roles and Permissions (RBAC)

```mermaid
erDiagram
    resource_servers {
        text id PK
        text tenant_id PK
        text identifier UK "API audience"
        text name
        text scopes "JSON array"
        text signing_alg
        integer token_lifetime
        integer allow_offline_access
    }

    roles {
        text id PK
        text tenant_id PK
        text name
        text description
        integer is_system
    }

    role_permissions {
        text tenant_id PK
        text role_id PK,FK
        text resource_server_identifier PK,FK
        text permission_name PK
    }

    user_roles {
        text tenant_id PK
        text user_id PK,FK
        text role_id PK,FK
        text organization_id PK "empty = tenant-wide"
    }

    user_permissions {
        text tenant_id PK
        text user_id PK,FK
        text resource_server_identifier PK,FK
        text permission_name PK
        text organization_id PK "empty = tenant-wide"
    }

    resource_servers ||--o{ role_permissions : "permissions on"
    resource_servers ||--o{ user_permissions : "permissions on"
    roles ||--o{ role_permissions : "grants"
    roles ||--o{ user_roles : "assigned via"
```

- **`resource_servers`** — APIs that AuthHero issues access tokens for: audience `identifier`, scope definitions, signing configuration, and token lifetimes.
- **`roles`** / **`role_permissions`** — named roles and the permissions they grant on resource servers.
- **`user_roles`** / **`user_permissions`** — role assignments and direct permission grants per user. Both include `organization_id` in the primary key, so the same user can hold different roles per organization (empty string means tenant-wide).

## Organizations

Organizations provide B2B-style sub-tenancy within a tenant.

```mermaid
erDiagram
    organizations {
        text id PK
        text tenant_id
        text name
        text display_name
        text branding "JSON"
        text enabled_connections "JSON array"
        text token_quota "JSON"
    }

    user_organizations {
        text id PK
        text tenant_id
        text user_id FK
        text organization_id FK
    }

    invites {
        text id PK
        text tenant_id
        text organization_id FK
        text inviter "JSON"
        text invitee "JSON"
        text client_id FK
        text connection_id FK
        text roles "JSON array"
        integer ttl_sec
        text expires_at
    }

    organizations ||--o{ user_organizations : "members"
    organizations ||--o{ invites : "pending invites"
```

- **`organizations`** — per-organization branding, enabled connections, and token quotas.
- **`user_organizations`** — many-to-many membership between users and organizations.
- **`invites`** — organization invitations carrying pre-configured roles and metadata for the invited user.

## Customization and Login Experience

All of these tables are keyed by (or scoped to) `tenant_id` and configure how the hosted login looks and behaves.

| Table | Purpose |
| --- | --- |
| `branding` | Logo, favicon, font, and color settings (one row per tenant). |
| `themes` | Full Universal Login theme: complete color palette, typography, borders, and widget layout. |
| `universal_login_templates` | Custom page template (HTML) wrapping the login widget. |
| `custom_text` | Per-prompt, per-language text overrides, keyed by `(tenant_id, prompt, language)`. |
| `prompt_settings` | Login flow behavior: identifier-first vs. combined, WebAuthn as first factor. |
| `email_providers` | Outbound email provider and credentials (one row per tenant). |
| `email_templates` | Per-template email content (subject, body, syntax), keyed by `(tenant_id, template)`. |
| `forms` | Custom form definitions (Auth0 Forms schema) with nodes, translations, and styling. |
| `flows` | Named action sequences that forms and hooks can trigger. |

## Extensibility: Hooks, Actions, and the Outbox

```mermaid
erDiagram
    hooks {
        text hook_id PK
        text tenant_id FK
        text trigger_id "e.g. post-user-registration"
        boolean enabled
        boolean synchronous
        integer priority
        text url "webhook hooks"
        text form_id FK "form hooks"
        text code_id FK "code hooks"
        text template_id "template hooks"
    }

    hook_code {
        text id PK
        text tenant_id FK
        text code
        text secrets "JSON"
    }

    actions {
        text id PK
        text tenant_id PK,FK
        text name
        text code
        text status
        text supported_triggers "JSON"
        integer deployed_at_ts
    }

    action_versions {
        text id PK
        text tenant_id PK,FK
        text action_id FK
        integer number
        text code
        integer deployed
    }

    action_executions {
        text id PK
        text tenant_id PK,FK
        text trigger_id
        text status
        text results "JSON"
    }

    outbox_events {
        text id PK
        text tenant_id FK
        text event_type
        text aggregate_type
        text aggregate_id
        text payload "JSON"
        text processed_at
        integer retry_count
        text dead_lettered_at
    }

    hooks |o--o| hook_code : "code hooks run"
    actions ||--o{ action_versions : "versioned as"
```

- **`hooks`** — trigger-based extension points. A hook is one of several types: webhook (`url`), form (`form_id`), custom code (`code_id` → `hook_code`), or template (`template_id`).
- **`actions`** / **`action_versions`** / **`action_executions`** — Auth0-compatible actions with versioned code deployments and per-trigger execution records.
- **`outbox_events`** — transactional outbox for reliably delivering domain events (webhooks, logs) with retries, claim-based workers, and a dead-letter state.

## Keys and Logs

```mermaid
erDiagram
    keys {
        text kid PK
        text tenant_id FK "null = shared signing key"
        text connection FK "connection-specific keys"
        text type "jwt_signing | ..."
        text cert
        text current_since
        text current_until
        text revoked_at
    }

    logs {
        text log_id PK
        text tenant_id
        text user_id
        text type "Auth0 event code, e.g. s, fp, seccft"
        text date
        text client_id
        text ip
        text user_agent
        text description
        text details "JSON"
        text country_code
        text city_name
    }
```

- **`keys`** — signing keys with rotation (`current_since` / `current_until`) and revocation. Keys can be tenant-wide or bound to a specific connection (e.g. SAML certificates).
- **`logs`** — the audit trail, using Auth0's event type codes, enriched with client, connection, and geo-IP context. Log rows are intentionally denormalized and have no foreign keys.

## Control-Plane Tables

Deployments that provision one isolated database per tenant (Workers for Platforms) keep a small control-plane schema in a separate database, defined in [`packages/drizzle/src/schema/control-plane/`](https://github.com/markusahlstrand/authhero/tree/main/packages/drizzle/src/schema/control-plane):

- **`tenant_operations`** / **`tenant_operation_events`** — long-running tenant lifecycle operations (provision, migrate, upgrade) with per-step event history. The database is the source of truth; workflow engines (e.g. Cloudflare Workflows) act as executors.
- **`rollouts`** — staged fleet-wide upgrades with canary tenants and wave sizes.

## Database Design Principles

### Multi-Tenancy

Every tenant-scoped table includes `tenant_id`, usually as part of a composite primary key, enforcing tenant isolation at the database level. Tables with a `references` constraint cascade-delete when the tenant is removed.

### Timestamps

Older tables store ISO-8601 strings in `created_at` / `updated_at`; newer tables use epoch-millisecond integers with a `_ts` suffix (`created_at_ts`). Adapters surface both as ISO strings in the API.

### JSON Storage

Complex or evolving configuration (auth params, client settings, device info, metadata) is stored as JSON in text columns, allowing schema evolution without migrations. The adapter layer parses and validates these against the shared types in `@authhero/adapter-interfaces`.

### Soft Relationships

Many relationships are by-ID without database foreign keys (marked `FK` in the diagrams for clarity). This keeps adapters portable across databases and simplifies data migration; referential integrity is maintained by the application layer.

This schema supports AuthHero's core mission of providing a flexible, secure, and scalable multi-tenant authentication system while maintaining compatibility with Auth0 APIs.
