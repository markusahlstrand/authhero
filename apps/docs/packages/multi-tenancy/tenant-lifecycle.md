---
title: Tenant Lifecycle
description: Complete tenant lifecycle management from creation to deletion including organization provisioning, database setup, settings inheritance, and cleanup.
---

# Tenant Lifecycle

This guide covers the complete lifecycle of tenants, from creation to deletion, including provisioning, configuration, and cleanup.

## Overview

The multi-tenancy package automates tenant lifecycle management, handling:

- Organization creation on the main tenant
- Database provisioning (if configured)
- Settings inheritance
- Role and permission assignment
- Cleanup and deprovisioning

## Creating Tenants

### Basic Creation

Use the tenant management API to create a new tenant:

```typescript
// POST /management/tenants
const response = await fetch("/management/tenants", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${mainTenantToken}`,
  },
  body: JSON.stringify({
    id: "acme",
    name: "Acme Corporation",
    friendly_name: "Acme Corp",
  }),
});
```

### Creation Flow

When a tenant is created, the following steps occur automatically:

```
┌──────────────────────────────────────────────────────────────┐
│                    TENANT CREATION FLOW                       │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  1. Validate tenant data                                     │
│     └─> Check ID uniqueness                                  │
│     └─> Validate required fields                             │
│                                                               │
│  2. Create tenant record                                     │
│     └─> Insert into database                                 │
│                                                               │
│  3. Create organization on main tenant                       │
│     └─> Organization ID = Tenant ID                          │
│     └─> Organization name = Tenant name                      │
│                                                               │
│  4. Assign default permissions/roles                         │
│     └─> Grant configured permissions to organization         │
│     └─> Assign default roles                                 │
│                                                               │
│  5. Provision database (if configured)                       │
│     └─> Create database instance                             │
│     └─> Run migrations                                       │
│     └─> Seed initial data                                    │
│                                                               │
│  6. Inherit settings (if configured)                         │
│     └─> Copy settings from main tenant                       │
│     └─> Apply transformations                                │
│                                                               │
│  7. Call onTenantCreated hooks                               │
│     └─> Custom post-creation logic                           │
│                                                               │
│  8. Return tenant data                                       │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

### With Configuration

Configure tenant creation behavior:

```typescript
const multiTenancy = setupMultiTenancy({
  accessControl: {
    mainTenantId: "main",
    defaultPermissions: [
      "tenant:admin",
      "users:read",
      "users:write",
      "applications:read",
      "applications:write",
    ],
    defaultRoles: ["tenant-admin"],
  },
  databaseIsolation: {
    getAdapters: factory.getAdapters,
    onProvision: async (tenantId) => {
      // Create database
      await factory.provision(tenantId);

      // Run migrations
      await runMigrations(tenantId);

      // Seed default data
      await seedDefaultData(tenantId, {
        includeExampleUsers: true,
        includeDefaultApplication: true,
      });
    },
  },
  settingsInheritance: {
    inheritFromMain: true,
    inheritedKeys: [
      "support_email",
      "logo",
      "primary_color",
      "session_lifetime",
    ],
    transformSettings: (settings, tenantId) => ({
      ...settings,
      support_email: `support+${tenantId}@example.com`,
    }),
  },
});
```

### Custom Hooks

Add custom logic during tenant creation:

```typescript
const multiTenancy = setupMultiTenancy({
  hooks: {
    onTenantCreated: async (tenant) => {
      // Send welcome email
      await sendWelcomeEmail(tenant);

      // Create default admin user
      await createAdminUser(tenant.id, {
        email: `admin@${tenant.id}.example.com`,
      });

      // Set up monitoring
      await setupMonitoring(tenant.id);

      // Log creation
      console.log(`Tenant ${tenant.id} created successfully`);
    },
  },
});
```

## Updating Tenants

### Partial Updates

Update tenant properties:

```typescript
// PATCH /management/tenants/:id
const response = await fetch("/management/tenants/acme", {
  method: "PATCH",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${mainTenantToken}`,
  },
  body: JSON.stringify({
    name: "Acme Corporation Inc.",
    friendly_name: "Acme Inc.",
  }),
});
```

### Update Hooks

React to tenant updates:

```typescript
const multiTenancy = setupMultiTenancy({
  hooks: {
    onTenantUpdated: async (oldTenant, newTenant) => {
      // Update organization on main tenant
      if (oldTenant.name !== newTenant.name) {
        await updateOrganization(newTenant.id, {
          display_name: newTenant.name,
        });
      }

      // Notify users of changes
      await notifyTenantUsers(newTenant.id, {
        message: "Tenant settings have been updated",
      });
    },
  },
});
```

## Deleting Tenants

### Basic Deletion

Delete a tenant via the API:

```typescript
// DELETE /management/tenants/:id
const response = await fetch("/management/tenants/acme", {
  method: "DELETE",
  headers: {
    Authorization: `Bearer ${mainTenantToken}`,
  },
});
```

### Deletion Flow

When a tenant is deleted:

```
┌──────────────────────────────────────────────────────────────┐
│                    TENANT DELETION FLOW                       │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  1. Call onTenantDeleting hooks                              │
│     └─> Perform backups                                      │
│     └─> Notify users                                         │
│     └─> Clean up resources                                   │
│                                                               │
│  2. Remove organization from main tenant                     │
│     └─> Delete organization record                           │
│     └─> Remove user memberships                              │
│                                                               │
│  3. Deprovision database (if configured)                     │
│     └─> Backup database                                      │
│     └─> Delete/archive database instance                     │
│                                                               │
│  4. Delete tenant record                                     │
│     └─> Remove from database                                 │
│                                                               │
│  5. Call onTenantDeleted hooks                               │
│     └─> Cleanup external resources                           │
│     └─> Update monitoring                                    │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

### With Cleanup Hooks

Configure cleanup behavior:

```typescript
const multiTenancy = setupMultiTenancy({
  databaseIsolation: {
    getAdapters: factory.getAdapters,
    onProvision: factory.provision,
    onDeprovision: async (tenantId) => {
      // Backup before deletion
      await backupDatabase(tenantId, {
        destination: `s3://backups/${tenantId}-${Date.now()}.sql`,
        includeMetadata: true,
      });

      // Archive important data
      await archiveData(tenantId);

      // Delete database
      await factory.deprovision(tenantId);
    },
  },
  hooks: {
    onTenantDeleting: async (tenant) => {
      // Notify tenant admins
      await notifyTenantAdmins(tenant.id, {
        subject: "Tenant Deletion Notice",
        message: `Tenant ${tenant.name} will be deleted`,
      });

      // Cancel subscriptions
      await cancelSubscriptions(tenant.id);

      // Remove external integrations
      await removeIntegrations(tenant.id);
    },
    onTenantDeleted: async (tenant) => {
      // Clean up monitoring
      await removeMonitoring(tenant.id);

      // Update billing
      await updateBilling(tenant.id, { status: "deleted" });

      // Log deletion
      console.log(`Tenant ${tenant.id} deleted successfully`);
    },
  },
});
```

## Provisioning

### Database Provisioning

Automatically provision databases for new tenants:

```typescript
const multiTenancy = setupMultiTenancy({
  databaseIsolation: {
    onProvision: async (tenantId) => {
      console.log(`Provisioning database for ${tenantId}`);

      // 1. Create database instance
      const database = await createDatabase({
        name: `tenant_${tenantId}`,
        region: "us-east-1",
      });

      // 2. Run migrations
      await runMigrations(tenantId, {
        migrationsPath: "./migrations",
        targetVersion: "latest",
      });

      // 3. Seed default data
      await seedData(tenantId, {
        users: [
          {
            email: `admin@${tenantId}.example.com`,
            role: "admin",
          },
        ],
        applications: [
          {
            name: "Default Application",
            client_id: generateClientId(),
          },
        ],
      });

      // 4. Configure backups
      await configureBackups(database.id, {
        frequency: "daily",
        retention: 30,
      });

      console.log(`Database provisioned for ${tenantId}`);
    },
  },
});
```

### Custom Resource Provisioning

Provision additional resources:

```typescript
const multiTenancy = setupMultiTenancy({
  hooks: {
    onTenantCreated: async (tenant) => {
      // Provision storage bucket
      await createStorageBucket({
        name: `tenant-${tenant.id}-storage`,
        region: "us-east-1",
        encryption: true,
      });

      // Set up CDN
      await setupCDN({
        origin: `https://${tenant.id}.api.example.com`,
        domain: `${tenant.id}.cdn.example.com`,
      });

      // Configure DNS
      await configureDNS({
        subdomain: tenant.id,
        baseDomain: "example.com",
        type: "CNAME",
        value: "proxy.example.com",
      });

      // Create API keys
      await createAPIKeys(tenant.id, {
        scopes: ["read", "write"],
      });
    },
  },
});
```

## Migration and Seeding

### Running Migrations

Execute database migrations for tenant databases:

```typescript
async function runMigrations(tenantId: string) {
  const db = await getTenantDatabase(tenantId);

  // Get current migration version
  const currentVersion = await db.query(
    "SELECT version FROM migrations ORDER BY version DESC LIMIT 1",
  );

  // Load migration files
  const migrations = await loadMigrations("./migrations");

  // Run pending migrations
  for (const migration of migrations) {
    if (migration.version > currentVersion) {
      console.log(`Running migration ${migration.version} for ${tenantId}`);

      await db.transaction(async (tx) => {
        await tx.exec(migration.up);
        await tx.query("INSERT INTO migrations (version, name) VALUES (?, ?)", [
          migration.version,
          migration.name,
        ]);
      });
    }
  }
}
```

### Seeding Data

Seed default data for new tenants:

```typescript
async function seedDefaultData(tenantId: string, options: SeedOptions) {
  const adapters = await getAdapters(tenantId);

  if (options.includeDefaultApplication) {
    // Create default application
    await adapters.applications.create(tenantId, {
      id: generateId(),
      name: "Default Application",
      client_id: generateClientId(),
      client_secret: generateClientSecret(),
      allowed_callback_urls: [`https://${tenantId}.example.com/callback`],
      allowed_logout_urls: [`https://${tenantId}.example.com`],
    });
  }

  if (options.includeExampleUsers) {
    // Create example users
    await adapters.users.create(tenantId, {
      id: generateId(),
      email: `admin@${tenantId}.example.com`,
      email_verified: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  // Create default connection
  await adapters.connections.create(tenantId, {
    id: generateId(),
    name: "Username-Password-Authentication",
    strategy: "auth0",
    enabled_clients: ["*"],
  });
}
```

## Status and Health Checks

### Check Tenant Status

Monitor tenant provisioning status:

```typescript
interface TenantStatus {
  id: string;
  status: "provisioning" | "active" | "suspended" | "deleting" | "deleted";
  database: {
    provisioned: boolean;
    healthy: boolean;
    lastMigration?: string;
  };
  organization: {
    created: boolean;
    id?: string;
  };
  settings: {
    inherited: boolean;
  };
}

async function getTenantStatus(tenantId: string): Promise<TenantStatus> {
  const tenant = await getTenant(tenantId);
  const org = await getOrganization(tenantId);
  const dbHealth = await checkDatabaseHealth(tenantId);

  return {
    id: tenantId,
    status: tenant.status,
    database: {
      provisioned: dbHealth.exists,
      healthy: dbHealth.responding,
      lastMigration: dbHealth.migrationVersion,
    },
    organization: {
      created: !!org,
      id: org?.id,
    },
    settings: {
      inherited: tenant.settings_inherited ?? false,
    },
  };
}
```

### Health Monitoring

Set up health checks for tenant resources:

```typescript
const multiTenancy = setupMultiTenancy({
  hooks: {
    onTenantCreated: async (tenant) => {
      // Schedule health checks
      await scheduleHealthChecks(tenant.id, {
        interval: "5m",
        endpoints: [
          `https://${tenant.id}.api.example.com/health`,
          `https://${tenant.id}.example.com`,
        ],
        alerts: {
          slack: `#tenant-${tenant.id}-alerts`,
          email: `ops@example.com`,
        },
      });
    },
  },
});
```

## Best Practices

### 1. Idempotent Provisioning

Ensure provisioning can be safely retried:

```typescript
async function provision(tenantId: string) {
  // Check if already provisioned
  const exists = await databaseExists(tenantId);
  if (exists) {
    console.log(`Database for ${tenantId} already exists`);
    return;
  }

  // Create database
  await createDatabase(tenantId);
}
```

### 2. Graceful Degradation

Handle provisioning failures gracefully:

```typescript
const multiTenancy = setupMultiTenancy({
  databaseIsolation: {
    onProvision: async (tenantId) => {
      try {
        await createDatabase(tenantId);
        await runMigrations(tenantId);
      } catch (error) {
        console.error(`Provisioning failed for ${tenantId}:`, error);

        // Mark tenant as needing provisioning
        await updateTenant(tenantId, {
          status: "provisioning_failed",
          error: error.message,
        });

        // Queue for retry
        await queueProvisioningRetry(tenantId);

        throw error;
      }
    },
  },
});
```

### 3. Backup Before Deletion

Always backup data before deleting:

```typescript
const multiTenancy = setupMultiTenancy({
  hooks: {
    onTenantDeleting: async (tenant) => {
      // Create final backup
      const backup = await backupDatabase(tenant.id);

      // Store backup metadata
      await storeBackupMetadata({
        tenantId: tenant.id,
        backupId: backup.id,
        timestamp: new Date().toISOString(),
        size: backup.size,
        location: backup.url,
      });

      // Keep backup for 90 days
      await scheduleBackupDeletion(backup.id, {
        deleteAfter: 90 * 24 * 60 * 60 * 1000,
      });
    },
  },
});
```

### 4. Asynchronous Operations

Use queues for long-running operations:

```typescript
async function createTenant(data: TenantInput) {
  // Create tenant record immediately
  const tenant = await db.tenants.create(data);

  // Queue provisioning tasks
  await queue.add("provision-database", { tenantId: tenant.id });
  await queue.add("create-organization", { tenantId: tenant.id });
  await queue.add("send-welcome-email", { tenantId: tenant.id });

  return tenant;
}
```

## Next Steps

- [Settings Inheritance](./settings-inheritance.md) - Configure settings inheritance
- [Subdomain Routing](./subdomain-routing.md) - Set up subdomain routing
- [API Reference](./api-reference.md) - Complete API documentation
