---
title: Architecture
description: Understand AuthHero's modular architecture including the core library, UI widget, SAML package, admin dashboard, adapters, and multi-tenant design.
---

# AuthHero Architecture

This document provides an overview of the AuthHero architecture and how its components interact.

## System Overview

AuthHero is built as a modular system with several key packages and applications:

### Core Packages

1. **authhero** - The main package that handles authentication logic, OAuth2/OIDC flows, and API routes
2. **@authhero/widget** - Server-driven UI web component for authentication flows (StencilJS-based)
3. **@authhero/adapter-interfaces** - TypeScript interfaces for data adapters
4. **@authhero/kysely-adapter** - SQL adapter implementation using Kysely query builder
5. **@authhero/drizzle-adapter** - SQL adapter implementation using Drizzle ORM
6. **@authhero/saml** - SAML authentication utilities with pluggable signing strategies
7. **@authhero/multi-tenancy** - Multi-tenant support with organization-based access control
8. **@authhero/aws** - AWS Lambda adapter for running AuthHero on AWS
9. **@authhero/cloudflare** - Cloudflare Workers adapter for running on Cloudflare's edge
10. **create-authhero** - CLI tool for scaffolding new AuthHero projects

### Applications

1. **react-admin** - React-based admin dashboard for managing tenants, users, and configurations
2. **auth0-proxy** - Compatibility proxy for Auth0 SDK integration
3. **demo** - Example application showcasing AuthHero features and integration patterns
4. **docs** - Documentation website (this site)

## Architecture Layers

AuthHero follows a layered architecture:

```
┌─────────────────────────────────────────────────────────┐
│                    Applications                         │
│  React Admin │ Auth0 Proxy │ Demo App │ Your App       │
└─────────────────────────────────────────────────────────┘
                           │
┌─────────────────────────────────────────────────────────┐
│                   Frontend Layer                        │
│              @authhero/widget (Web Component)           │
│          Server-Driven UI, Auth0 Forms Compatible       │
└─────────────────────────────────────────────────────────┘
                           │
┌─────────────────────────────────────────────────────────┐
│                    Core Library                         │
│                     authhero                            │
│  ┌───────────────────────────────────────────────────┐ │
│  │ Universal Login Routes                            │ │
│  │  - /u/  (server-rendered, JSX)                    │ │
│  │  - /u2/ (client-side widget)                      │ │
│  │  - /u/flow-widget/ (hybrid with flow API)         │ │
│  ├───────────────────────────────────────────────────┤ │
│  │ OAuth2/OIDC Endpoints                             │ │
│  │  /authorize, /oauth/token, /userinfo, /.well-known│ │
│  ├───────────────────────────────────────────────────┤ │
│  │ Management API (Auth0-compatible)                 │ │
│  │  /api/v2/* - Users, Clients, Connections, etc.    │ │
│  ├───────────────────────────────────────────────────┤ │
│  │ Hooks System                                      │ │
│  │  - Code-based hooks (onExecute*)                  │ │
│  │  - URL hooks (webhooks)                           │ │
│  │  - Form hooks (custom forms)                      │ │
│  │  - Entity CRUD hooks                              │ │
│  ├───────────────────────────────────────────────────┤ │
│  │ Authentication Strategies                         │ │
│  │  - Password, Code, Social, SAML, Enterprise       │ │
│  └───────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
                           │
┌─────────────────────────────────────────────────────────┐
│              Data Adapter Layer                         │
│  @authhero/adapter-interfaces (TypeScript interfaces)   │
│  @authhero/kysely-adapter │ @authhero/drizzle-adapter   │
└─────────────────────────────────────────────────────────┘
                           │
┌─────────────────────────────────────────────────────────┐
│                   Database Layer                        │
│  PostgreSQL │ MySQL │ SQLite │ D1 │ Turso │ etc.       │
└─────────────────────────────────────────────────────────┘
```

## Universal Login System

AuthHero provides three approaches to universal login, all sharing the same backend logic:

### 1. Server-Rendered Login (/u/)

Traditional server-rendered pages with JSX components:

- Full HTML pages rendered on the server
- Direct form submission to backend handlers
- Includes pre-built screens: identifier, password, code entry, signup, password reset

### 2. Client-Side Widget (/u2/)

Pure client-side approach using the authhero-widget:

- HTML page loads the widget web component
- Widget fetches screen configurations from API
- Fully client-side interaction with server API
- Better for SPAs and custom integrations

### 3. Flow-Based Widget (/u/flow-widget/)

Hybrid approach using the Form/Flow system:

- Configurable flows via Management API
- Server-driven UI with client-side widget
- Supports custom forms and progressive profiling
- Compatible with Auth0's Forms API schema

## UI Widget (@authhero/widget)

The widget is a **pure UI component** built with StencilJS that:

- Renders forms based on Auth0's Forms API schema
- Emits events instead of handling auth directly
- Works with any auth library (auth0-spa-js, custom, etc.)
- Supports 27+ Auth0-compatible component types
- Framework-agnostic (React, Vue, Angular, vanilla JS)
- Server-side rendering (SSR) support
- Customizable via CSS custom properties

**Key Features:**

- **Server-Driven UI (SDUI)**: Server controls what UI elements render
- **Zero-Deploy Updates**: Update auth flows without redeploying
- **Event-Based**: Emits `formSubmit`, `buttonClick`, `linkClick`, `error`, `complete` events
- **Auto-Submit Mode**: Optional mode for automatic form handling

## Multi-Tenant Architecture

AuthHero supports two multi-tenancy models:

### 1. Basic Multi-Tenancy (Core)

Built into the core `authhero` package:

- Multiple tenants share the same database
- Data isolation via `tenant_id` column
- Each tenant has its own users, clients, connections, settings
- Custom branding per tenant
- Management API scoped to tenant

### 2. Organization-Based Multi-Tenancy (@authhero/multi-tenancy)

Advanced multi-tenancy with organization hierarchy:

- **Control Plane**: Main tenant managing all child tenants
- **Child Tenants**: Isolated tenants with their own databases
- **Token-Based Access**: JWT tokens with `org_id` claims control access
- **Database Isolation**: Per-tenant D1, Turso, or custom databases
- **Entity Sync**: Automatically sync resource servers, roles, connections from control plane
- **Subdomain Routing**: Automatic subdomain-to-tenant resolution
- **Settings Inheritance**: Child tenants inherit configuration from control plane

## Authentication Flow

A typical OAuth2/OIDC authorization code flow:

```
┌──────────┐                                    ┌──────────┐
│          │  1. GET /authorize                 │          │
│  Client  │─────────────────────────────────>  │ AuthHero │
│   App    │                                    │          │
└──────────┘                                    └──────────┘
                                                      │
                                                      │ 2. Redirect to
                                                      │    Universal Login
                                                      ▼
                                           ┌────────────────────┐
                                           │  Universal Login   │
                                           │  (widget or JSX)   │
                                           └────────────────────┘
                                                      │
                                                      │ 3. User authenticates
                                                      │    (hooks execute)
                                                      ▼
┌──────────┐                                    ┌──────────┐
│          │  4. Redirect with code             │          │
│  Client  │<─────────────────────────────────  │ AuthHero │
│   App    │                                    │          │
└──────────┘                                    └──────────┘
      │                                               ▲
      │  5. POST /oauth/token                         │
      │     (exchange code for tokens)                │
      └───────────────────────────────────────────────┘
                                                      │
                                                      │ 6. Return tokens
                                                      ▼
                                                  ┌─────────┐
                                                  │  Hooks  │
                                                  │ Execute │
                                                  └─────────┘
```

## Hooks System

AuthHero provides multiple hook types for customization:

### Code-Based Hooks (Application Config)

Defined in your application initialization:

- `onExecutePreUserRegistration` - Before user creation
- `onExecutePostUserRegistration` - After user creation
- `onExecutePreUserUpdate` - Before user update
- `onExecutePreUserDeletion` - Before user deletion
- `onExecutePostUserDeletion` - After user deletion
- `onExecutePostLogin` - After successful authentication
- `onExecuteCredentialsExchange` - Before tokens are issued
- `onExecuteValidateRegistrationUsername` - Validate signup eligibility
- `onFetchUserInfo` - Add custom claims to /userinfo endpoint

### URL Hooks (Management API)

Configured via Management API to call external webhooks:

- Asynchronous HTTP POST requests
- Configured with trigger points, URLs, and secrets
- Support same triggers as code-based hooks

### Form Hooks (Management API)

Redirect to custom forms during auth flow:

- Progressive profiling
- Terms acceptance
- Additional data collection
- Custom consent flows

### Entity Hooks (Application Config)

CRUD lifecycle hooks for management entities (configured as arrays):

- `roles[]` - beforeCreate, afterCreate, beforeUpdate, afterUpdate, beforeDelete, afterDelete
- `connections[]` - Same lifecycle hooks
- `resourceServers[]` - Same lifecycle hooks
- `rolePermissions[]` - beforeAssign, afterAssign, beforeRemove, afterRemove
- `tenants[]` - Same lifecycle hooks (with @authhero/multi-tenancy)

## Data Adapter Pattern

AuthHero uses a pluggable adapter pattern for data persistence:

```typescript
interface DataAdapters {
  users: UsersAdapter;
  clients: ClientsAdapter;
  connections: ConnectionsAdapter;
  sessions: SessionsAdapter;
  codes: CodesAdapter;
  tickets: TicketsAdapter;
  keys: KeysAdapter;
  // ... and more
}
```

**Benefits:**

- Database-agnostic core library
- Easy to add new database support
- Testable with in-memory adapters
- Supports multiple databases in one application

**Available Adapters:**

- `@authhero/kysely-adapter` - Works with any SQL database (PostgreSQL, MySQL, SQLite, D1)
- `@authhero/drizzle-adapter` - Alternative SQL adapter using Drizzle ORM

## Platform Adapters

Run AuthHero on different platforms:

### @authhero/cloudflare

- Cloudflare Workers and Pages
- D1 database support
- Durable Objects for rate limiting
- R2 for asset storage
- Edge deployment

### @authhero/aws

- AWS Lambda functions
- RDS or Aurora databases
- DynamoDB support
- API Gateway integration
- CloudFront distribution

## React Admin Dashboard

The admin dashboard uses a dual-router architecture:

### Outer Router (Domain & Tenant Selection)

- `/` - Domain selector
- `/tenants/*` - Tenant management (with @authhero/multi-tenancy)
- `/:tenantId/*` - Admin interface for specific tenant
- `/auth-callback` - Authentication callback handler

### Inner Router (Tenant Resources)

- `/:tenantId/users` - User management
- `/:tenantId/clients` - Application management
- `/:tenantId/connections` - Identity provider configuration
- `/:tenantId/roles` - Role management
- `/:tenantId/permissions` - Permission management
- `/:tenantId/hooks` - Webhook configuration
- `/:tenantId/forms` - Custom form builder
- And more...

### Domain Selection System

- Cookie-based storage of available domains
- Multi-domain support (different AuthHero instances)
- Domain configuration: URL, client ID, API URL
- Easy switching between domains

## Integration Points

### OAuth2/OIDC Endpoints

- `GET /authorize` - Authorization endpoint
- `POST /oauth/token` - Token endpoint
- `GET /userinfo` - User info endpoint
- `GET /.well-known/openid-configuration` - Discovery endpoint
- `GET /.well-known/jwks.json` - JSON Web Key Set

### Management API (Auth0-compatible)

- `GET/POST/PATCH/DELETE /api/v2/users` - User management
- `GET/POST/PATCH/DELETE /api/v2/clients` - Application management
- `GET/POST/PATCH/DELETE /api/v2/connections` - Connection management
- `GET/POST/PATCH/DELETE /api/v2/roles` - Role management
- And 40+ more endpoints...

### Universal Login

- `/u/*` - Server-rendered login pages
- `/u2/*` - Client-side widget pages
- `/u/flow-widget/*` - Flow-based widget pages
- `/u/flow/*` - Flow API endpoints

### Widget Assets

- `/u/widget/*` - Widget JavaScript and assets
- Served by platform-specific static file handlers

## SAML Support

The `@authhero/saml` package provides:

- SAML request parsing
- SAML response generation
- Metadata generation
- Pluggable signing strategies:
  - Local signing (xml-crypto, Node.js only)
  - HTTP-based signing (edge/browser compatible)
  - Custom signers via SamlSigner interface

## Security Model

- **Multi-tenant isolation**: Tenant ID in all queries
- **Token-based authentication**: JWT access tokens and refresh tokens
- **PKCE support**: Proof Key for Code Exchange
- **Rate limiting**: Configurable per endpoint
- **CORS**: Configurable allowed origins
- **Hooks for validation**: Custom logic at all auth steps
- **Secret management**: Environment variables and secure storage
- **Session security**: HttpOnly cookies, secure flags, SameSite

## Extension Points

AuthHero is designed for extensibility:

1. **Custom Adapters**: Implement `DataAdapters` for any database
2. **Custom Strategies**: Add new authentication strategies
3. **Hooks**: Inject custom logic at any lifecycle point
4. **Management API Extensions**: Add custom routes via `managementApiExtensions`
5. **Custom Email/SMS Providers**: Implement `EmailService` or `SmsService`
6. **Custom Widgets**: Build on top of `@authhero/widget` or create your own
7. **SAML Signers**: Implement custom signing strategies

## Deployment Options

### Edge/Serverless

- Cloudflare Workers + D1
- Cloudflare Pages + D1
- AWS Lambda + Aurora Serverless
- Vercel Edge Functions

### Traditional

- Node.js + PostgreSQL
- Node.js + MySQL
- Docker containers
- Kubernetes

## Performance Considerations

- **Caching**: Built-in caching layer for frequently accessed data
- **Edge deployment**: Run close to users with Cloudflare Workers
- **Connection pooling**: Efficient database connections
- **Lazy loading**: Widget assets loaded on demand
- **Server timing**: Performance metrics in response headers
