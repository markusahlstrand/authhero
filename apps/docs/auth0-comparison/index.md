# AuthHero vs. Auth0

AuthHero is designed as a modern, open-source alternative to Auth0 with enhanced features and full control over your authentication infrastructure. This section highlights the key differences and improvements.

## Overview

| Feature                 | Auth0             | AuthHero                               |
| ----------------------- | ----------------- | -------------------------------------- |
| **Hosting**             | SaaS only         | Self-hosted or Edge                    |
| **Pricing**             | Per-MAU pricing   | Free, open-source                      |
| **Multi-tenancy**       | Enterprise plans  | Built-in, all plans                    |
| **Database**            | Managed           | Your choice (SQL, etc.)                |
| **Edge Deployment**     | Limited           | Full support (Workers, Edge Functions) |
| **Source Code**         | Closed            | Open source (ISC License)              |
| **Hooks System**        | Deprecated (2024) | Active & expanding                     |
| **User Deletion Hooks** | ❌ Not available  | ✅ Pre & Post hooks                    |

## Key Advantages

### 1. Full Control & Open Source

AuthHero gives you complete control over your authentication system:

- **Open Source**: Full source code access under ISC license
- **Self-Hosted**: Deploy on your infrastructure
- **Data Ownership**: Your data stays in your database
- **Customization**: Modify any part of the system

### 2. Built-in Multi-Tenancy

Unlike Auth0 where multi-tenancy is an enterprise feature, AuthHero includes it from day one:

- Data isolation per tenant
- Custom branding per tenant
- Custom domains per tenant
- Tenant-specific settings

[Learn more about Multi-Tenancy →](./multi-tenant)

### 3. Enhanced Hooks System

While Auth0 deprecated their Hooks feature in October 2024, AuthHero continues to expand its hooks capabilities:

#### Programmatic Hooks (Code-Based)

Define hooks directly in your application code:

```typescript
import { init } from "@authhero/authhero";

const auth = init({
  dataAdapter: myAdapter,
  hooks: {
    onExecutePreUserRegistration: async (event, api) => {
      // Add custom metadata
      api.user.setUserMetadata("signup_source", "web");
    },
    onExecutePreUserDeletion: async (event, api) => {
      // Validate before deletion
      if (event.user.role === "admin") {
        api.cancel(); // Prevent deletion
      }
    },
    onExecutePostUserDeletion: async (event, api) => {
      // Cleanup after deletion
      await cleanupExternalSystems(event.user_id);
    },
  },
});
```

#### Available Hooks

- ✅ `onExecutePreUserRegistration` - Modify user data before creation
- ✅ `onExecutePostUserRegistration` - Post-registration actions
- ✅ `onExecutePreUserUpdate` - Validate and modify updates
- ✅ `onExecutePreUserDeletion` - **AuthHero-only**: Validate before deletion
- ✅ `onExecutePostUserDeletion` - **AuthHero-only**: Cleanup after deletion
- ✅ `onExecutePostLogin` - Post-authentication customization
- ✅ `onExecuteCredentialsExchange` - Modify tokens before issuance

#### User Deletion Hooks

**Auth0 Limitation**: Auth0 does not provide action triggers for user deletion. This makes it difficult to:

- Validate deletion requests
- Clean up related data in external systems
- Send deletion notifications
- Maintain audit trails for GDPR compliance

**AuthHero Solution**: Provides both pre and post deletion hooks:

```typescript
hooks: {
  // Prevent deletion of critical users
  onExecutePreUserDeletion: async (event, api) => {
    if (event.user.app_metadata?.role === 'admin') {
      api.cancel(); // Prevents deletion
      return;
    }

    // Check for dependencies
    const hasActiveSubscription = await checkSubscription(event.user_id);
    if (hasActiveSubscription) {
      api.cancel();
    }
  },

  // Cleanup after successful deletion
  onExecutePostUserDeletion: async (event, api) => {
    // Delete from external systems
    await deleteUserFromCRM(event.user_id);
    await deleteUserFiles(event.user_id);

    // Send notifications
    await sendDeletionEmail(event.user.email);

    // Audit logging
    await logAuditEvent('user_deleted', {
      user_id: event.user_id,
      tenant_id: event.tenant.id,
      deleted_at: new Date().toISOString(),
    });
  },
}
```

#### Form Hooks

**AuthHero-only feature**: Render custom forms within the authentication flow without writing backend code:

```typescript
// Management API configuration
{
  "trigger_id": "post-user-login",
  "enabled": true,
  "form_id": "progressive-profile"
}
```

Use cases:

- Progressive profiling
- Terms of service acceptance
- Custom consent forms
- Multi-step onboarding

#### URL/Webhook Hooks

Call external services at specific trigger points:

```typescript
{
  "trigger_id": "post-user-registration",
  "enabled": true,
  "url": "https://api.example.com/webhooks/user-registered"
}
```

[Learn more about Hooks →](./hooks)

### 4. Edge-First Architecture

Built from the ground up for edge computing:

- **Cloudflare Workers**: Native support
- **Vercel Edge Functions**: Full compatibility
- **Deno Deploy**: Ready to use
- **Traditional Node.js**: Also supported

### 5. Database Flexibility

Choose your preferred database:

- **PostgreSQL** via Drizzle or Kysely
- **MySQL/MariaDB** via Kysely
- **SQLite** for development
- **Cloudflare D1** for edge deployment
- Custom adapters for any database

### 6. Auth0 Compatibility Layer

Migrate from Auth0 with minimal code changes:

- **Auth0 Proxy**: Drop-in replacement for Auth0 API
- **Compatible endpoints**: `/oauth/token`, `/userinfo`, etc.
- **JWT format**: Same token structure
- **Migration tools**: Import existing users and configuration

## Feature Comparison

### Authentication Methods

| Method               | Auth0 | AuthHero |
| -------------------- | ----- | -------- |
| Username/Password    | ✅    | ✅       |
| Passwordless (Email) | ✅    | ✅       |
| Passwordless (SMS)   | ✅    | ✅       |
| Social OAuth         | ✅    | ✅       |
| Enterprise SAML      | ✅    | ✅       |
| Custom Connections   | ✅    | ✅       |

### Developer Experience

| Feature            | Auth0         | AuthHero        |
| ------------------ | ------------- | --------------- |
| SDK Libraries      | ✅ Many       | ✅ Growing      |
| REST API           | ✅            | ✅              |
| GraphQL API        | ❌            | 🚧 Planned      |
| Webhooks           | ✅ Limited    | ✅ Extensive    |
| Programmatic Hooks | ❌ Deprecated | ✅ Active       |
| Local Development  | ⚠️ Limited    | ✅ Full support |
| Testing Support    | ⚠️ Complex    | ✅ Built-in     |

### Management & Operations

| Feature              | Auth0         | AuthHero        |
| -------------------- | ------------- | --------------- |
| Admin Dashboard      | ✅            | ✅              |
| User Management      | ✅            | ✅              |
| Logs & Analytics     | ✅            | ✅              |
| Custom Domains       | ✅ Enterprise | ✅ All plans    |
| Branding             | ✅ Limited    | ✅ Full control |
| Email Templates      | ✅            | ✅              |
| Multi-tenant Support | ✅ Enterprise | ✅ Built-in     |

## Migration from Auth0

AuthHero makes migration straightforward:

1. **Deploy AuthHero** with your database
2. **Import users** using the migration API
3. **Update configuration** (domains, clients)
4. **Use Auth0 proxy** for gradual migration
5. **Update SDKs** to native AuthHero (optional)

### Migration Benefits

- **Cost Savings**: No per-MAU charges
- **Better Performance**: Edge deployment
- **More Control**: Full code access
- **Enhanced Features**: User deletion hooks, form hooks, etc.
- **No Vendor Lock-in**: Open source with standard protocols

## When to Choose AuthHero

Choose AuthHero if you:

- ✅ Want full control over your authentication system
- ✅ Need built-in multi-tenancy without enterprise pricing
- ✅ Prefer self-hosting or edge deployment
- ✅ Want to avoid per-user pricing models
- ✅ Need user deletion hooks for GDPR compliance
- ✅ Value open source and code transparency
- ✅ Want to customize every aspect of authentication
- ✅ Need to deploy to edge locations globally

## When Auth0 Might Be Better

Auth0 may be a better fit if you:

- Prefer fully managed SaaS with no infrastructure management
- Need enterprise features with dedicated support
- Require extensive SDK support for all platforms
- Want pre-built integrations with many services
- Need regulatory certifications (SOC2, HIPAA, etc.)

## Getting Started with AuthHero

Ready to try AuthHero? Start here:

1. [Getting Started Guide](/getting-started) - Quick start tutorial
2. [Architecture Overview](/architecture) - Understanding the system
3. [Hooks Documentation](./hooks) - Implementing custom logic

## Community & Support

- **GitHub**: [markusahlstrand/authhero](https://github.com/markusahlstrand/authhero)
- **Issues**: Report bugs or request features
- **Discussions**: Community Q&A
- **Documentation**: Comprehensive guides and API reference

---

_AuthHero is an independent open-source project and is not affiliated with Auth0 or Okta._
