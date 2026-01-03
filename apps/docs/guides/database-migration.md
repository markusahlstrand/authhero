---
title: Database Migration Guide
description: Migrate between databases using AuthHero's passthrough adapter. Run dual databases, sync writes, verify data integrity, and switch with zero downtime.
---

# Database Migration Guide

This guide demonstrates how to migrate from one database to another using AuthHero's passthrough adapter system. You'll run both databases in parallel, sync all writes to both systems, verify data integrity, and then switch over with zero downtime.

## Overview

AuthHero's database-agnostic design allows you to:

- **Run multiple databases simultaneously** during migration
- **Sync all writes** to both old and new databases
- **Read from the old database** while building up the new one
- **Verify data integrity** before switching
- **Switch databases** without downtime by changing configuration

## Migration Strategy

The migration process follows these phases:

1. **Setup**: Configure both old and new adapters
2. **Dual-Write**: Write to both databases, read from old
3. **Backfill**: Copy existing data to new database
4. **Verification**: Compare data between databases
5. **Switchover**: Make new database primary
6. **Cleanup**: Remove old database once stable

## Example: PostgreSQL to MySQL Migration

This example shows migrating from PostgreSQL (with Kysely) to MySQL (with Drizzle).

### Phase 1: Setup Both Adapters

First, install and configure both adapters:

```bash
pnpm add @authhero/kysely @authhero/drizzle
```

Create connections to both databases:

```typescript
// src/database.ts
import { Kysely, PostgresDialect } from "kysely";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { createKyselyAdapter } from "@authhero/kysely";
import { createDrizzleAdapter } from "@authhero/drizzle";

// Old database: PostgreSQL with Kysely
const postgresDb = new Kysely({
  dialect: new PostgresDialect({
    host: process.env.POSTGRES_HOST,
    database: process.env.POSTGRES_DB,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
  }),
});

// New database: MySQL with Drizzle
const mysqlConnection = await mysql.createPool({
  host: process.env.MYSQL_HOST,
  database: process.env.MYSQL_DB,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
});

const mysqlDb = drizzle(mysqlConnection);

// Create adapters
export const postgresAdapter = createKyselyAdapter(postgresDb);
export const mysqlAdapter = createDrizzleAdapter(mysqlDb);
```

### Phase 2: Configure Dual-Write

Use the passthrough adapter to write to both databases:

```typescript
// src/adapters.ts
import { createPassthroughAdapter } from "@authhero/adapter-interfaces";
import { postgresAdapter, mysqlAdapter } from "./database";

// Track sync errors for monitoring
const syncErrors = new Map<string, number>();

function handleSyncError(entity: string) {
  return (error: Error, method: string, args: unknown[]) => {
    const key = `${entity}.${method}`;
    syncErrors.set(key, (syncErrors.get(key) || 0) + 1);

    console.error(`MySQL sync failed for ${key}:`, {
      error: error.message,
      args: args.slice(0, 2), // Log first 2 args (usually tenantId, id)
    });

    // Send to your monitoring system
    // reportError(error, { entity, method });
  };
}

// Create dual-write adapters for each entity
export const dataAdapter = {
  // For entities being migrated, use passthrough
  users: createPassthroughAdapter({
    primary: postgresAdapter.users,
    secondaries: [
      {
        adapter: mysqlAdapter.users,
        blocking: true, // Wait to ensure MySQL write succeeds
        onError: handleSyncError("users"),
      },
    ],
  }),

  tenants: createPassthroughAdapter({
    primary: postgresAdapter.tenants,
    secondaries: [
      {
        adapter: mysqlAdapter.tenants,
        blocking: true,
        onError: handleSyncError("tenants"),
      },
    ],
  }),

  applications: createPassthroughAdapter({
    primary: postgresAdapter.applications,
    secondaries: [
      {
        adapter: mysqlAdapter.applications,
        blocking: true,
        onError: handleSyncError("applications"),
      },
    ],
  }),

  // Add all other entities...
  connections: createPassthroughAdapter({
    primary: postgresAdapter.connections,
    secondaries: [
      {
        adapter: mysqlAdapter.connections,
        blocking: true,
        onError: handleSyncError("connections"),
      },
    ],
  }),

  logs: createPassthroughAdapter({
    primary: postgresAdapter.logs,
    secondaries: [
      {
        adapter: mysqlAdapter.logs,
        blocking: false,
        onError: handleSyncError("logs"),
      },
    ], // Logs can be non-blocking
  }),

  sessions: createPassthroughAdapter({
    primary: postgresAdapter.sessions,
    secondaries: [
      {
        adapter: mysqlAdapter.sessions,
        blocking: true,
        onError: handleSyncError("sessions"),
      },
    ],
  }),

  codes: createPassthroughAdapter({
    primary: postgresAdapter.codes,
    secondaries: [
      {
        adapter: mysqlAdapter.codes,
        blocking: true,
        onError: handleSyncError("codes"),
      },
    ],
  }),

  passwords: createPassthroughAdapter({
    primary: postgresAdapter.passwords,
    secondaries: [
      {
        adapter: mysqlAdapter.passwords,
        blocking: true,
        onError: handleSyncError("passwords"),
      },
    ],
  }),

  // Include any platform-specific adapters from primary
  // These typically don't need migration
  ...postgresAdapter,
};

// Export sync error stats for monitoring
export function getSyncErrorStats() {
  return Object.fromEntries(syncErrors.entries());
}
```

Update your application to use the new adapter:

```typescript
// src/index.ts
import { init } from "@authhero/authhero";
import { dataAdapter } from "./adapters";

const app = init({
  dataAdapter,
  // ... other config
});

export default app;
```

### Phase 3: Backfill Existing Data

Create a script to copy existing data from PostgreSQL to MySQL:

```typescript
// scripts/backfill-data.ts
import { postgresAdapter, mysqlAdapter } from "../src/database";

async function backfillEntity<T>(
  entityName: string,
  getAll: () => Promise<T[]>,
  create: (item: T) => Promise<void>,
) {
  console.log(`Backfilling ${entityName}...`);

  const items = await getAll();
  console.log(`Found ${items.length} ${entityName} to migrate`);

  let successful = 0;
  let failed = 0;

  for (const item of items) {
    try {
      await create(item);
      successful++;

      if (successful % 100 === 0) {
        console.log(`  Migrated ${successful}/${items.length} ${entityName}`);
      }
    } catch (error) {
      failed++;
      console.error(`  Failed to migrate ${entityName}:`, error);
    }
  }

  console.log(
    `✓ Completed ${entityName}: ${successful} successful, ${failed} failed\n`,
  );
  return { successful, failed };
}

async function backfillTenants() {
  const { tenants } = await postgresAdapter.tenants.list();

  return backfillEntity(
    "tenants",
    async () => tenants,
    async (tenant) => {
      await mysqlAdapter.tenants.create(tenant);
    },
  );
}

async function backfillUsers() {
  // Get all tenants first
  const { tenants } = await postgresAdapter.tenants.list();
  let totalSuccessful = 0;
  let totalFailed = 0;

  for (const tenant of tenants) {
    console.log(`Backfilling users for tenant ${tenant.id}...`);

    const { users } = await postgresAdapter.users.list(tenant.id, {});

    const result = await backfillEntity(
      `users (${tenant.id})`,
      async () => users,
      async (user) => {
        await mysqlAdapter.users.create(tenant.id, user);
      },
    );

    totalSuccessful += result.successful;
    totalFailed += result.failed;
  }

  return { successful: totalSuccessful, failed: totalFailed };
}

async function main() {
  console.log("Starting database backfill...\n");

  // Backfill in dependency order
  await backfillTenants();
  await backfillUsers();
  // Add other entities in correct order

  console.log("Backfill complete!");
}

main().catch(console.error);
```

Run the backfill:

```bash
tsx scripts/backfill-data.ts
```

### Phase 4: Verification

Create a verification script to compare data:

```typescript
// scripts/verify-migration.ts
import { postgresAdapter, mysqlAdapter } from "../src/database";

async function verifyEntity<T extends { id?: string }>(
  entityName: string,
  getPostgres: () => Promise<T[]>,
  getMySQL: () => Promise<T[]>,
) {
  console.log(`Verifying ${entityName}...`);

  const [postgresItems, mysqlItems] = await Promise.all([
    getPostgres(),
    getMySQL(),
  ]);

  console.log(`  PostgreSQL: ${postgresItems.length} records`);
  console.log(`  MySQL: ${mysqlItems.length} records`);

  if (postgresItems.length !== mysqlItems.length) {
    console.error(`  ✗ Count mismatch!\n`);
    return false;
  }

  // Check for missing records
  const postgresIds = new Set(postgresItems.map((item) => item.id));
  const mysqlIds = new Set(mysqlItems.map((item) => item.id));

  const missingInMySQL = [...postgresIds].filter((id) => !mysqlIds.has(id));
  const extraInMySQL = [...mysqlIds].filter((id) => !postgresIds.has(id));

  if (missingInMySQL.length > 0) {
    console.error(`  ✗ ${missingInMySQL.length} records missing in MySQL`);
    console.error(`  Missing IDs:`, missingInMySQL.slice(0, 5));
    return false;
  }

  if (extraInMySQL.length > 0) {
    console.warn(`  ⚠ ${extraInMySQL.length} extra records in MySQL`);
    console.warn(`  Extra IDs:`, extraInMySQL.slice(0, 5));
  }

  console.log(`  ✓ ${entityName} verified\n`);
  return true;
}

async function main() {
  console.log("Starting migration verification...\n");

  const results = await Promise.all([
    verifyEntity(
      "tenants",
      async () => (await postgresAdapter.tenants.list()).tenants,
      async () => (await mysqlAdapter.tenants.list()).tenants,
    ),

    verifyEntity(
      "users",
      async () => {
        const { tenants } = await postgresAdapter.tenants.list();
        const allUsers = [];
        for (const tenant of tenants) {
          const { users } = await postgresAdapter.users.list(tenant.id, {});
          allUsers.push(...users);
        }
        return allUsers;
      },
      async () => {
        const { tenants } = await mysqlAdapter.tenants.list();
        const allUsers = [];
        for (const tenant of tenants) {
          const { users } = await mysqlAdapter.users.list(tenant.id, {});
          allUsers.push(...users);
        }
        return allUsers;
      },
    ),

    // Add other entities...
  ]);

  const allPassed = results.every((result) => result);

  if (allPassed) {
    console.log("✓ All verifications passed! Ready to switch over.");
  } else {
    console.error("✗ Verification failed. Do not switch over yet.");
    process.exit(1);
  }
}

main().catch(console.error);
```

Run verification regularly:

```bash
tsx scripts/verify-migration.ts
```

### Phase 5: Monitor Sync Health

Add a monitoring endpoint to track sync errors:

```typescript
// src/routes/admin.ts
import { Hono } from "hono";
import { getSyncErrorStats } from "./adapters";

const admin = new Hono();

admin.get("/migration-status", (c) => {
  const errors = getSyncErrorStats();
  const totalErrors = Object.values(errors).reduce(
    (sum, count) => sum + count,
    0,
  );

  return c.json({
    status: totalErrors === 0 ? "healthy" : "errors",
    totalErrors,
    errorsByEntity: errors,
  });
});

export default admin;
```

### Phase 6: Switchover

Once verification passes and sync errors are minimal, switch to MySQL as primary:

```typescript
// src/adapters.ts
export const dataAdapter = {
  users: createPassthroughAdapter({
    primary: mysqlAdapter.users, // ← Changed to MySQL
    secondaries: [
      {
        adapter: postgresAdapter.users, // ← Keep PostgreSQL as backup
        blocking: false, // Non-blocking now
        onError: handleSyncError("users (postgres-backup)"),
      },
    ],
  }),

  // Update all other entities similarly...
};
```

Deploy this change and monitor for issues. All reads now come from MySQL, while writes still go to both databases.

### Phase 7: Cleanup

After running successfully for a reasonable period (e.g., 1 week):

1. **Remove PostgreSQL secondaries**:

```typescript
// src/adapters.ts
export const dataAdapter = mysqlAdapter; // Use MySQL directly
```

2. **Decommission PostgreSQL database** (after taking a final backup)

3. **Clean up old code and dependencies**:

```bash
pnpm remove @authhero/kysely kysely pg
```

## Migration Checklist

Use this checklist to track your migration progress:

- [ ] Install and configure new adapter
- [ ] Set up passthrough adapters for all entities
- [ ] Deploy dual-write configuration
- [ ] Monitor sync errors (should be zero)
- [ ] Run backfill script
- [ ] Verify backfill completed successfully
- [ ] Run verification script regularly
- [ ] Monitor application performance with dual-write
- [ ] Plan switchover window
- [ ] Switch primary to new database
- [ ] Monitor new database performance
- [ ] Keep old database as backup for 1-2 weeks
- [ ] Final verification before cleanup
- [ ] Remove old database
- [ ] Clean up old adapter dependencies

## Best Practices

### Use Blocking for Critical Data

```typescript
// Critical data: use blocking to ensure consistency
users: createPassthroughAdapter({
  primary: oldAdapter.users,
  secondaries: [{ adapter: newAdapter.users, blocking: true }],
}),

// Logs: can be non-blocking
logs: createPassthroughAdapter({
  primary: oldAdapter.logs,
  secondaries: [{ adapter: newAdapter.logs, blocking: false }],
}),
```

### Monitor Everything

```typescript
const metrics = {
  syncErrors: new Map(),
  syncLatency: new Map(),
};

function handleSyncError(entity: string) {
  return (error: Error, method: string, args: unknown[]) => {
    // Increment error counter
    const key = `${entity}.${method}`;
    metrics.syncErrors.set(key, (metrics.syncErrors.get(key) || 0) + 1);

    // Alert if error rate is high
    if (metrics.syncErrors.get(key)! > 10) {
      sendAlert(`High sync error rate for ${key}`);
    }
  };
}
```

### Gradual Migration

Don't migrate everything at once. Start with less critical entities:

1. **Week 1**: Logs and sessions (can tolerate issues)
2. **Week 2**: Applications and connections
3. **Week 3**: Users and tenants (most critical)
4. **Week 4**: Switchover

### Have a Rollback Plan

Keep the rollback path simple - just change the configuration back:

```typescript
// Rollback: swap primary back to old database
export const dataAdapter = {
  users: createPassthroughAdapter({
    primary: oldAdapter.users, // ← Change back
    secondaries: [{ adapter: newAdapter.users, blocking: false }],
  }),
};
```

## Troubleshooting

### High Sync Latency

If writes are taking too long:

```typescript
// Use non-blocking for less critical data
secondaries: [
  {
    adapter: newAdapter.users,
    blocking: false, // Don't wait for sync
  },
];
```

### Sync Failures

If you see sync errors:

1. Check the `onError` logs for details
2. Verify database connectivity
3. Check for schema mismatches
4. Ensure data types are compatible
5. Verify foreign key constraints exist

### Data Mismatches

If verification fails:

1. Check the verification script output
2. Run backfill again for affected entities
3. Investigate specific mismatched records
4. Check for ongoing sync errors

## Advanced: Cross-Region Migration

For cross-region migrations with different ORMs:

```typescript
// Region 1: PostgreSQL + Kysely
const region1Adapter = createKyselyAdapter(region1Db);

// Region 2: MySQL + Drizzle
const region2Adapter = createDrizzleAdapter(region2Db);

// Write to both regions
const dataAdapter = {
  users: createPassthroughAdapter({
    primary: region1Adapter.users,
    secondaries: [
      {
        adapter: region2Adapter.users,
        blocking: false, // Non-blocking for cross-region
        onError: (error) => {
          // Queue for retry
          retryQueue.add({ entity: "users", error });
        },
      },
    ],
  }),
};
```

## Special Case: Migrating from External Auth Providers

The same passthrough adapter pattern can be used to migrate from external authentication services like Auth0, Okta, AWS Cognito, or other identity providers to AuthHero. This approach uses an **auth-provider adapter** that proxies to the external service.

### Auth-Provider Adapter Concept

An auth-provider adapter implements the AuthHero adapter interfaces but proxies calls to an external authentication service's API:

```typescript
// Conceptual example - NOT provided by AuthHero
import { createPassthroughAdapter } from "@authhero/adapter-interfaces";

// Custom adapter that proxies to external auth service
const externalAuthAdapter = createExternalAuthAdapter({
  domain: "your-tenant.auth-provider.com",
  managementToken: process.env.AUTH_PROVIDER_TOKEN,
  clientId: process.env.AUTH_PROVIDER_CLIENT_ID,
  clientSecret: process.env.AUTH_PROVIDER_CLIENT_SECRET,
});

// AuthHero database adapter
const authHeroAdapter = createKyselyAdapter(db);

// Phase 1: External auth primary, AuthHero secondary (dual-write)
const dataAdapter = {
  users: createPassthroughAdapter({
    primary: externalAuthAdapter.users, // Read from external service
    secondaries: [
      {
        adapter: authHeroAdapter.users, // Write to AuthHero
        blocking: true,
      },
    ],
  }),

  sessions: createPassthroughAdapter({
    primary: externalAuthAdapter.sessions,
    secondaries: [
      {
        adapter: authHeroAdapter.sessions,
        blocking: false,
      },
    ],
  }),

  // ... other entities
};
```

### What Needs to be Implemented

To create an auth-provider adapter, you need to implement these key components:

#### 1. User Management Adapter

```typescript
export function createExternalUsersAdapter(config: ExternalAuthConfig) {
  return {
    async get(tenantId: string, userId: string) {
      // Call external auth provider's API
      const response = await fetch(
        `https://${config.domain}/api/users/${userId}`,
        {
          headers: { Authorization: `Bearer ${config.managementToken}` },
        },
      );

      // Transform external format to AuthHero format
      const externalUser = await response.json();
      return transformToAuthHeroUser(externalUser);
    },

    async list(tenantId: string, params) {
      // Query users from external service
      // May need to filter by tenant using metadata or tags
      const response = await fetch(
        `https://${config.domain}/api/users?tenant=${tenantId}`,
        {
          headers: { Authorization: `Bearer ${config.managementToken}` },
        },
      );

      const externalUsers = await response.json();
      return {
        users: externalUsers.map(transformToAuthHeroUser),
      };
    },

    // Write operations during migration
    async create(tenantId: string, user) {
      // Option 1: Proxy to external service
      // Option 2: Throw error (read-only during migration)
      throw new Error("User creation not supported during migration");
    },

    async update(tenantId: string, userId: string, updates) {
      // Proxy updates to external service
      const response = await fetch(
        `https://${config.domain}/api/users/${userId}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${config.managementToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(transformToExternalFormat(updates)),
        },
      );

      return transformToAuthHeroUser(await response.json());
    },
  };
}
```

#### 2. Session/Token Management

```typescript
export function createExternalSessionsAdapter(config: ExternalAuthConfig) {
  return {
    async get(tenantId: string, sessionId: string) {
      // External auth services typically don't expose sessions
      // Store mapping of AuthHero session ID -> external tokens

      const mapping = await getSessionMapping(sessionId);
      if (!mapping) return null;

      // Validate external token is still valid
      const isValid = await validateExternalToken(
        mapping.external_access_token,
      );

      if (!isValid) {
        // Try to refresh using external refresh token
        const refreshed = await refreshExternalToken(
          mapping.external_refresh_token,
        );

        if (refreshed) {
          await updateSessionMapping(sessionId, refreshed);
          return transformToAuthHeroSession(refreshed);
        }

        return null;
      }

      return transformToAuthHeroSession(mapping);
    },

    async create(tenantId: string, session) {
      // When proxying authentication:
      // 1. External service handles actual auth
      // 2. Receive external tokens
      // 3. Store mapping for future use

      const sessionId = generateSessionId();

      await storeSessionMapping(sessionId, {
        tenant_id: tenantId,
        user_id: session.user_id,
        external_access_token: session.external_access_token,
        external_refresh_token: session.external_refresh_token,
        external_id_token: session.external_id_token,
        expires_at: session.expires_at,
      });

      return {
        id: sessionId,
        tenant_id: tenantId,
        user_id: session.user_id,
        created_at: new Date().toISOString(),
        expires_at: session.expires_at,
      };
    },
  };
}
```

#### 3. Authentication Flow Proxying

```typescript
// In your AuthHero initialization
export function createAuthFlowProxy(config: ExternalAuthConfig) {
  return {
    // Proxy OAuth authorization to external service
    async handleAuthorize(params) {
      // Redirect to external auth service
      return {
        redirect: `https://${config.domain}/authorize?${new URLSearchParams({
          client_id: config.clientId,
          redirect_uri: params.redirect_uri,
          response_type: params.response_type,
          scope: params.scope,
          state: params.state,
        })}`,
      };
    },

    // Proxy token exchange to external service
    async handleTokenExchange(params) {
      const response = await fetch(`https://${config.domain}/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: params.grant_type,
          code: params.code,
          client_id: config.clientId,
          client_secret: config.clientSecret,
          redirect_uri: params.redirect_uri,
        }),
      });

      const tokens = await response.json();

      // Store in AuthHero session format
      await authHeroAdapter.sessions.create(tenantId, {
        user_id: tokens.sub,
        external_access_token: tokens.access_token,
        external_refresh_token: tokens.refresh_token,
        expires_at: new Date(
          Date.now() + tokens.expires_in * 1000,
        ).toISOString(),
      });

      return tokens;
    },
  };
}
```

### Migration Process

The migration follows the same phases as database migration:

#### Phase 1: Dual-Write Mode

```typescript
// External auth is primary, AuthHero is secondary
const dataAdapter = {
  users: createPassthroughAdapter({
    primary: externalAuthAdapter.users,
    secondaries: [{ adapter: authHeroAdapter.users, blocking: true }],
  }),
};
```

All reads from external service, all writes go to both.

#### Phase 2: Backfill Historical Data

```typescript
// scripts/backfill-from-external-auth.ts
async function backfillUsers() {
  const { users } = await externalAuthAdapter.users.list("tenant-id", {});

  for (const user of users) {
    await authHeroAdapter.users.create("tenant-id", user);
  }
}

// Run backfill
await backfillUsers();
```

#### Phase 3: Session Continuity Strategy

Unlike database migration, session continuity is possible through token proxying:

```typescript
// During migration, sessions from external auth continue to work
// AuthHero proxies token validation/refresh to external service
// New authentications create both external and AuthHero sessions

// Progressive migration: new users -> AuthHero, existing -> external
async function routeAuthentication(userId: string) {
  const user = await authHeroAdapter.users.get("tenant-id", userId);

  if (user && user.migrated_to_authhero) {
    // Use AuthHero authentication
    return authHeroAuth(user);
  }

  // Proxy to external auth
  return externalAuth(userId);
}
```

#### Phase 4: Verification

```typescript
// Verify users match between systems
const externalUsers = await externalAuthAdapter.users.list("tenant-id", {});
const authHeroUsers = await authHeroAdapter.users.list("tenant-id", {});

console.log(`External: ${externalUsers.users.length}`);
console.log(`AuthHero: ${authHeroUsers.users.length}`);

// Check for discrepancies
const missing = externalUsers.users.filter(
  (eu) => !authHeroUsers.users.find((au) => au.user_id === eu.user_id),
);
console.log(`Missing in AuthHero: ${missing.length}`);
```

#### Phase 5: Switchover

```typescript
// Switch to AuthHero as primary
const dataAdapter = {
  users: createPassthroughAdapter({
    primary: authHeroAdapter.users, // Now primary
    secondaries: [
      {
        adapter: externalAuthAdapter.users, // Keep as backup
        blocking: false,
      },
    ],
  }),
};
```

#### Phase 6: Remove External Adapter

```typescript
// Once confident, use AuthHero directly
const dataAdapter = authHeroAdapter;
```

### Key Challenges

1. **Session Format Differences**: External auth tokens must be mapped to AuthHero sessions
2. **Tenant Mapping**: External services may not have native multi-tenancy support
3. **Feature Parity**: Not all features may map 1:1 (custom database scripts, rules, etc.)
4. **Rate Limits**: External API rate limits may slow down backfill
5. **Token Expiry**: Must handle token refresh during migration period

### Benefits of This Approach

- **Zero downtime**: External auth keeps working during migration
- **Session continuity**: Existing sessions remain valid through proxying
- **Gradual rollout**: Migrate users progressively
- **Reversible**: Can switch back to external auth if issues arise
- **Familiar pattern**: Same as database migration with passthrough adapters

### Example: Auth0-to-AuthHero Migration

```typescript
// Custom Auth0 adapter implementation
const auth0Adapter = createAuth0Adapter({
  domain: "your-tenant.auth0.com",
  managementToken: process.env.AUTH0_MGMT_TOKEN,
  clientId: process.env.AUTH0_CLIENT_ID,
  clientSecret: process.env.AUTH0_CLIENT_SECRET,
});

const authHeroAdapter = createKyselyAdapter(db);

// Week 1-2: Dual-write, Auth0 primary
const phase1Adapter = {
  users: createPassthroughAdapter({
    primary: auth0Adapter.users,
    secondaries: [{ adapter: authHeroAdapter.users, blocking: true }],
  }),
};

// Week 3: Backfill and verify
await backfillFromAuth0();
await verifyDataSync();

// Week 4: Switch to AuthHero primary, Auth0 backup
const phase2Adapter = {
  users: createPassthroughAdapter({
    primary: authHeroAdapter.users,
    secondaries: [{ adapter: auth0Adapter.users, blocking: false }],
  }),
};

// Week 5+: Remove Auth0 once stable
const finalAdapter = authHeroAdapter;
```

::: warning
**Note**: AuthHero does not currently provide adapters for external authentication services (Auth0, Okta, AWS Cognito, etc.). These would need to be implemented as custom adapters following the patterns described above.

If you're migrating from an external auth provider and need assistance designing an adapter, please open a discussion on [GitHub](https://github.com/authhero/authhero/discussions).
:::

## Related Documentation

- [Adapter Concepts](/concepts/adapters) - Understanding adapter architecture
- [Adapter Interfaces](/adapters/interfaces/) - Complete adapter API reference
- [Kysely Adapter](/adapters/kysely/) - PostgreSQL/MySQL/SQLite adapter
- [Drizzle Adapter](/adapters/drizzle/) - Drizzle ORM adapter
- [AWS Adapter](/adapters/aws/) - DynamoDB adapter
