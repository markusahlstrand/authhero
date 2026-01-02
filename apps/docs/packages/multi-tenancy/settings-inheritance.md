---
title: Settings Inheritance
description: Automatically inherit settings from the main tenant to child tenants. Reduce setup time, maintain consistency, and override per tenant.
---

# Settings Inheritance

Configure child tenants to automatically inherit settings from the control plane tenant, reducing configuration overhead and ensuring consistency.

## Overview

Settings inheritance allows you to:

- Share common configuration across all tenants
- Reduce setup time for new tenants
- Maintain consistent branding and behavior
- Override inherited settings per tenant
- Transform settings for each tenant

## Basic Configuration

### Inherit All Settings

The simplest configuration inherits all compatible settings:

```typescript
import { init } from "@authhero/multi-tenancy";

const { app } = init({
  dataAdapter,
  controlPlaneTenantId: "control_plane",
  multiTenancy: {
    settingsInheritance: {
      inheritFromControlPlane: true,
    },
  },
});
```

When a tenant is created, it will inherit all settings from the control plane tenant except for identifying fields like `id`, `name`, `created_at`, etc.

### Inherit Specific Keys

Inherit only specific settings:

```typescript
const { app } = init({
  dataAdapter,
  controlPlaneTenantId: "control_plane",
  multiTenancy: {
    settingsInheritance: {
      inheritFromControlPlane: true,
      inheritedKeys: [
        "support_email",
        "logo",
        "primary_color",
        "secondary_color",
        "session_lifetime",
        "idle_session_lifetime",
        "password_policy",
      ],
    },
  },
});
```

### Exclude Specific Keys

Inherit all settings except specific ones:

```typescript
const { app } = init({
  dataAdapter,
  controlPlaneTenantId: "control_plane",
  multiTenancy: {
    settingsInheritance: {
      inheritFromControlPlane: true,
      excludedKeys: [
        "id",
        "name",
        "friendly_name",
        "created_at",
        "updated_at",
        "custom_domain",
      ],
    },
  },
});
```

## Transformation

### Transform Settings

Apply transformations to inherited settings:

```typescript
const { app } = init({
  dataAdapter,
  controlPlaneTenantId: "control_plane",
  multiTenancy: {
    settingsInheritance: {
      inheritFromControlPlane: true,
      transformSettings: (controlPlaneSettings, newTenantId) => {
        return {
          ...controlPlaneSettings,
          // Customize support email per tenant
          support_email: `support+${newTenantId}@example.com`,

          // Use tenant-specific logo path
          logo: controlPlaneSettings.logo?.replace("/control_plane/", `/${newTenantId}/`),

          // Add tenant ID to callback URLs
          allowed_callback_urls: controlPlaneSettings.allowed_callback_urls?.map((url) =>
            url.replace("{{tenant}}", newTenantId),
          ),
        };
      },
    },
  },
});
```

### Conditional Inheritance

Inherit settings based on conditions:

```typescript
const { app } = init({
  dataAdapter,
  controlPlaneTenantId: "control_plane",
  multiTenancy: {
    settingsInheritance: {
      inheritFromControlPlane: true,
      transformSettings: (controlPlaneSettings, newTenantId) => {
        // You can add custom logic here based on tenant ID or other factors
        // For example, different session lifetimes for different tenant types
        const isEnterprise = newTenantId.startsWith("ent-");

        if (isEnterprise) {
          return {
            ...controlPlaneSettings,
            session_lifetime: 28800, // 8 hours for enterprise
            idle_session_lifetime: 3600,
          };
        }

        return {
          ...controlPlaneSettings,
          session_lifetime: 3600, // 1 hour for standard
          idle_session_lifetime: 900,
        };
      },
    },
  },
});
```

## Inheritance Flow

### How It Works

```
┌──────────────────────────────────────────────────────────────────┐
│                   SETTINGS INHERITANCE FLOW                       │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  1. Fetch control plane tenant settings                          │
│     └─> GET /api/v2/tenants/control_plane                        │
│                                                                   │
│  2. Filter settings                                              │
│     └─> Apply inheritedKeys if specified                         │
│     └─> Or remove excludedKeys                                   │
│                                                                   │
│  3. Transform settings                                           │
│     └─> Call transformSettings() if provided                     │
│     └─> Pass tenant ID                                           │
│                                                                   │
│  4. Merge with new tenant data                                   │
│     └─> New tenant data takes precedence                         │
│     └─> Inherited settings fill in gaps                          │
│                                                                   │
│  5. Apply to new tenant                                          │
│     └─> Save merged settings                                     │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### Example Flow

Given control plane tenant settings:

```json
{
  "id": "control_plane",
  "name": "Control Plane",
  "support_email": "support@example.com",
  "logo": "https://cdn.example.com/logo.png",
  "primary_color": "#007bff",
  "session_lifetime": 3600
}
```

With configuration:

```typescript
{
  inheritFromControlPlane: true,
  inheritedKeys: ["support_email", "logo", "primary_color"],
  transformSettings: (settings, tenantId) => ({
    ...settings,
    support_email: `support+${tenantId}@example.com`,
  }),
}
```

Creating tenant "acme" results in:

```json
{
  "id": "acme",
  "name": "Acme Corporation",
  "support_email": "support+acme@example.com",
  "logo": "https://cdn.example.com/logo.png",
  "primary_color": "#007bff"
}
```

## Common Patterns

### Branding Settings

Inherit branding consistently:

```typescript
const { app } = init({
  dataAdapter,
  controlPlaneTenantId: "control_plane",
  multiTenancy: {
    settingsInheritance: {
      inheritFromControlPlane: true,
      inheritedKeys: [
        "logo",
        "favicon",
        "primary_color",
        "secondary_color",
        "font_family",
        "custom_css",
      ],
      transformSettings: (settings, tenantId) => ({
        ...settings,
        // Allow tenant-specific logo override
        logo: settings.logo?.replace("/logos/control_plane.png", `/logos/${tenantId}.png`),
      }),
    },
  },
});
```

### Security Settings

Inherit security policies:

```typescript
const { app } = init({
  dataAdapter,
  controlPlaneTenantId: "control_plane",
  multiTenancy: {
    settingsInheritance: {
      inheritFromControlPlane: true,
      inheritedKeys: [
        "password_policy",
      "mfa_enabled",
      "session_lifetime",
      "idle_session_lifetime",
      "jwt_algorithm",
      "jwt_expiration",
    ],
  },
});
```

### Email Configuration

Inherit email settings with customization:

```typescript
const multiTenancy = setupMultiTenancy({
  settingsInheritance: {
    inheritFromMain: true,
    inheritedKeys: [
      "email_provider",
      "email_from_name",
      "email_from_address",
      "email_templates",
    ],
    transformSettings: (settings, tenantId) => ({
      ...settings,
      email_from_address: `noreply+${tenantId}@example.com`,
      email_templates: {
        ...settings.email_templates,
        // Customize template URLs
        welcome: settings.email_templates?.welcome?.replace(
          "{{tenant}}",
          tenantId,
        ),
        verification: settings.email_templates?.verification?.replace(
          "{{tenant}}",
          tenantId,
        ),
      },
    }),
  },
});
```

### OAuth Configuration

Inherit OAuth provider settings:

```typescript
const multiTenancy = setupMultiTenancy({
  settingsInheritance: {
    inheritFromMain: true,
    inheritedKeys: ["oauth_providers", "social_connections"],
    transformSettings: (settings, tenantId) => {
      // Update callback URLs for each provider
      const providers = { ...settings.oauth_providers };

      for (const [key, config] of Object.entries(providers)) {
        providers[key] = {
          ...config,
          callback_url: `https://${tenantId}.example.com/callback/${key}`,
        };
      }

      return {
        ...settings,
        oauth_providers: providers,
      };
    },
  },
});
```

## Overriding Inherited Settings

### Update After Creation

Tenants can override inherited settings:

```typescript
// Update tenant settings
await fetch(`/api/v2/tenants/${tenantId}/settings`, {
  method: "PATCH",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${tenantToken}`,
  },
  body: JSON.stringify({
    primary_color: "#ff0000", // Override inherited color
    logo: "https://acme.com/custom-logo.png", // Override inherited logo
  }),
});
```

### Explicit Overrides During Creation

Provide overrides when creating a tenant:

```typescript
await fetch("/management/tenants", {
  method: "POST",
  body: JSON.stringify({
    id: "acme",
    name: "Acme Corporation",
    settings: {
      // These override inherited values
      primary_color: "#ff0000",
      support_email: "help@acme.com",
    },
  }),
});
```

## Dynamic Inheritance

### Conditional Based on Tenant Data

Inherit different settings based on tenant metadata:

```typescript
const multiTenancy = setupMultiTenancy({
  settingsInheritance: {
    inheritFromMain: true,
    transformSettings: async (settings, tenantId, metadata) => {
      // Fetch tenant-specific configuration
      const tenantConfig = await getTenantConfig(tenantId);

      // Different session lifetimes based on plan
      let sessionLifetime = settings.session_lifetime;
      if (tenantConfig.plan === "enterprise") {
        sessionLifetime = 28800; // 8 hours
      } else if (tenantConfig.plan === "pro") {
        sessionLifetime = 7200; // 2 hours
      }

      return {
        ...settings,
        session_lifetime: sessionLifetime,
        mfa_enabled: tenantConfig.plan !== "basic",
      };
    },
  },
});
```

### Region-Specific Settings

Apply region-specific transformations:

```typescript
const multiTenancy = setupMultiTenancy({
  settingsInheritance: {
    inheritFromMain: true,
    transformSettings: (settings, tenantId, metadata) => {
      const region = metadata.region || "us";

      return {
        ...settings,
        support_email: `support-${region}@example.com`,
        privacy_policy_url: `https://example.com/${region}/privacy`,
        terms_of_service_url: `https://example.com/${region}/terms`,
        default_language: {
          us: "en",
          eu: "en-GB",
          de: "de",
          fr: "fr",
        }[region],
      };
    },
  },
});
```

## Propagating Changes

### Update All Tenants

When main tenant settings change, optionally propagate to child tenants:

```typescript
async function propagateSettingsToTenants(
  settingsUpdate: Partial<TenantSettings>,
) {
  const tenants = await getAllTenants();

  for (const tenant of tenants) {
    // Only update inherited settings
    const inheritedSettings = filterInheritedSettings(
      settingsUpdate,
      tenant.inheritedKeys,
    );

    if (Object.keys(inheritedSettings).length > 0) {
      await updateTenantSettings(tenant.id, inheritedSettings);
      console.log(`Updated settings for tenant ${tenant.id}`);
    }
  }
}
```

### Selective Propagation

Propagate only specific changes:

```typescript
async function updateMainTenantSettings(updates: Partial<TenantSettings>) {
  // Update main tenant
  await updateTenantSettings("main", updates);

  // Determine which settings to propagate
  const propagatable = ["logo", "primary_color", "support_email"];
  const toPropagate = Object.keys(updates).filter((key) =>
    propagatable.includes(key),
  );

  if (toPropagate.length > 0) {
    const settingsToPropagate = pick(updates, toPropagate);
    await propagateSettingsToTenants(settingsToPropagate);
  }
}
```

## Best Practices

### 1. Document Inherited Settings

Keep track of which settings are inherited:

```typescript
interface TenantMetadata {
  inheritedSettings: string[];
  inheritedAt: string;
  canOverride: boolean;
}
```

### 2. Version Settings

Track settings versions for migrations:

```typescript
const multiTenancy = setupMultiTenancy({
  settingsInheritance: {
    transformSettings: (settings, tenantId) => ({
      ...settings,
      settings_version: "2.0",
      inherited_at: new Date().toISOString(),
    }),
  },
});
```

### 3. Validate Transformed Settings

Ensure transformed settings are valid:

```typescript
const multiTenancy = setupMultiTenancy({
  settingsInheritance: {
    transformSettings: (settings, tenantId) => {
      const transformed = {
        ...settings,
        support_email: `support+${tenantId}@example.com`,
      };

      // Validate transformed settings
      const validation = validateTenantSettings(transformed);
      if (!validation.valid) {
        throw new Error(`Invalid settings: ${validation.errors}`);
      }

      return transformed;
    },
  },
});
```

### 4. Allow Opt-Out

Let tenants opt out of inheritance for specific settings:

```typescript
async function updateTenantSettings(
  tenantId: string,
  updates: Partial<TenantSettings>,
  options?: { disableInheritance?: string[] },
) {
  const tenant = await getTenant(tenantId);

  // Mark settings as not inherited
  if (options?.disableInheritance) {
    tenant.non_inherited_keys = [
      ...(tenant.non_inherited_keys || []),
      ...options.disableInheritance,
    ];
  }

  await updateTenant(tenantId, {
    ...updates,
    non_inherited_keys: tenant.non_inherited_keys,
  });
}
```

## Next Steps

- [Subdomain Routing](./subdomain-routing.md) - Set up subdomain routing
- [API Reference](./api-reference.md) - Complete API documentation
- [Migration Guide](./migration.md) - Migrate from single to multi-tenant
