# Migration Guide

Learn how to migrate from a single-tenant AuthHero setup to multi-tenant architecture.

## Overview

This guide covers:

- Planning your multi-tenant migration
- Migrating existing data
- Updating application code
- Testing and deployment strategies
- Rolling back if needed

## Before You Begin

### Prerequisites

- Existing AuthHero installation
- Database backup
- Understanding of your current architecture
- Plan for tenant organization

### Planning Checklist

- [ ] Identify which data belongs to which tenant
- [ ] Choose a main tenant ID
- [ ] Plan subdomain structure
- [ ] Decide on database isolation strategy
- [ ] Review settings to inherit
- [ ] Plan user migration strategy
- [ ] Test migration in staging environment

## Migration Strategies

### Strategy 1: Single Database with Tenant Scoping

Keep all tenants in one database, add tenant scoping.

**Pros:**

- Simplest migration
- No data movement required
- Lower infrastructure costs

**Cons:**

- No physical data isolation
- Potential performance impact at scale
- Shared resource limits

**Best for:**

- Small to medium deployments
- Tenants with similar usage patterns
- Cost-sensitive implementations

### Strategy 2: Database Isolation

Move each tenant to its own database.

**Pros:**

- Complete data isolation
- Independent scaling
- Better performance isolation
- Easier compliance (data residency)

**Cons:**

- More complex infrastructure
- Higher costs
- Data migration required

**Best for:**

- Large deployments
- Tenants with varying workloads
- Strict compliance requirements

## Step-by-Step Migration

### Step 1: Install Multi-Tenancy Package

```bash
pnpm add @authhero/multi-tenancy
```

### Step 2: Backup Your Data

```bash
# PostgreSQL example
pg_dump -h localhost -U user -d authhero > backup-$(date +%Y%m%d).sql

# SQLite example
sqlite3 authhero.db ".backup backup-$(date +%Y%m%d).db"
```

### Step 3: Choose Your Main Tenant

Identify which existing tenant becomes the "main" tenant:

```typescript
// This is typically your first/original tenant
const MAIN_TENANT_ID = "your-original-tenant-id";
```

### Step 4: Create Organizations

Create an organization on the main tenant for each existing tenant:

```typescript
import { setupMultiTenancy } from "@authhero/multi-tenancy";

// For each existing tenant (except main)
const existingTenants = ["tenant-a", "tenant-b", "tenant-c"];

for (const tenantId of existingTenants) {
  // Create organization on main tenant
  await mainTenantAdapters.organizations.create(MAIN_TENANT_ID, {
    id: generateId(),
    name: tenantId,
    display_name: await getTenantName(tenantId),
  });
}
```

### Step 5: Update Application Code

#### Before (Single Tenant)

```typescript
import { createAuthhero } from "authhero";

const app = createAuthhero({
  dataAdapter: createAdapter(db),
});

export default app;
```

#### After (Multi-Tenant)

```typescript
import { Hono } from "hono";
import { createAuthhero } from "authhero";
import { setupMultiTenancy } from "@authhero/multi-tenancy";

const multiTenancy = setupMultiTenancy({
  accessControl: {
    mainTenantId: "main",
    defaultPermissions: ["tenant:admin"],
  },
});

const app = new Hono();

// Apply multi-tenancy middleware
app.use("*", multiTenancy.middleware);

// Mount tenant management
app.route("/management", multiTenancy.app);

// Mount AuthHero with hooks
app.route(
  "/",
  createAuthhero({
    dataAdapter: createAdapter(db),
    hooks: multiTenancy.hooks,
  }),
);

export default app;
```

### Step 6: Update Client Applications

#### React Admin Changes

**Before:**

```typescript
// Single tenant - no organization parameter
const { getAccessTokenSilently } = useAuth0();

const fetchUsers = async () => {
  const token = await getAccessTokenSilently();
  const response = await fetch("/api/v2/users", {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.json();
};
```

**After:**

```typescript
// Multi-tenant - use organization parameter
const { getAccessTokenSilently } = useAuth0();
const tenantId = useParams().tenantId;

const fetchUsers = async () => {
  const token = await getAccessTokenSilently({
    authorizationParams: {
      organization: tenantId,
    },
  });
  const response = await fetch("/api/v2/users", {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.json();
};
```

### Step 7: Migrate to Database Isolation (Optional)

If implementing database isolation:

#### 7.1 Create Databases

```typescript
import { createD1Factory } from "@authhero/cloudflare";

const factory = createD1Factory({
  accountId: env.CF_ACCOUNT_ID,
  apiToken: env.CF_API_TOKEN,
});

// Provision databases for existing tenants
for (const tenantId of existingTenants) {
  await factory.provision(tenantId);
}
```

#### 7.2 Migrate Data

```typescript
async function migrateTenantData(tenantId: string) {
  // Get source data (from shared database)
  const sourceDb = getSharedDatabase();
  const targetDb = await getTenantDatabase(tenantId);

  // Migrate users
  const users = await sourceDb.query(
    "SELECT * FROM users WHERE tenant_id = ?",
    [tenantId],
  );
  for (const user of users) {
    await targetDb.query("INSERT INTO users (...) VALUES (...)", [user]);
  }

  // Migrate applications
  const apps = await sourceDb.query(
    "SELECT * FROM applications WHERE tenant_id = ?",
    [tenantId],
  );
  for (const app of apps) {
    await targetDb.query("INSERT INTO applications (...) VALUES (...)", [app]);
  }

  // Migrate other tables...
}

// Run migration for each tenant
for (const tenantId of existingTenants) {
  console.log(`Migrating ${tenantId}...`);
  await migrateTenantData(tenantId);
  console.log(`✓ ${tenantId} migrated`);
}
```

#### 7.3 Verify Migration

```typescript
async function verifyMigration(tenantId: string) {
  const sourceDb = getSharedDatabase();
  const targetDb = await getTenantDatabase(tenantId);

  // Count records in source
  const sourceUsers = await sourceDb.query(
    "SELECT COUNT(*) FROM users WHERE tenant_id = ?",
    [tenantId],
  );

  // Count records in target
  const targetUsers = await targetDb.query("SELECT COUNT(*) FROM users");

  if (sourceUsers[0].count !== targetUsers[0].count) {
    throw new Error(`User count mismatch for ${tenantId}`);
  }

  console.log(`✓ ${tenantId} verification passed`);
}
```

#### 7.4 Switch to New Databases

```typescript
const multiTenancy = setupMultiTenancy({
  accessControl: {
    mainTenantId: "main",
  },
  databaseIsolation: {
    getAdapters: factory.getAdapters,
    onProvision: factory.provision,
    onDeprovision: factory.deprovision,
  },
});
```

### Step 8: Update Tenant Management

Move from in-tenant management to centralized:

**Before:**

```typescript
// Managing tenants within the same database
POST / api / v2 / tenants;
GET / api / v2 / tenants;
```

**After:**

```typescript
// Managing tenants from main tenant
POST / management / tenants;
GET / management / tenants;

// Tenant-scoped settings still in tenant context
GET / api / v2 / tenants / settings;
PATCH / api / v2 / tenants / settings;
```

## Testing Migration

### Test Plan

1. **Unit Tests**: Verify each component works in isolation
2. **Integration Tests**: Test the full flow
3. **Load Tests**: Ensure performance is acceptable
4. **User Acceptance Testing**: Have users test critical flows

### Test Checklist

- [ ] Users can log in to all tenants
- [ ] Tenant isolation is enforced
- [ ] Data is accessible from correct tenant
- [ ] Cross-tenant access is blocked
- [ ] Settings inheritance works
- [ ] Subdomain routing works (if configured)
- [ ] Tenant creation/deletion works
- [ ] Performance is acceptable

### Sample Tests

```typescript
import { describe, it, expect } from "vitest";

describe("Multi-Tenancy", () => {
  it("should isolate tenant data", async () => {
    // Create users in different tenants
    await createUser("tenant-a", { email: "user@a.com" });
    await createUser("tenant-b", { email: "user@b.com" });

    // Verify isolation
    const tenantAUsers = await getUsers("tenant-a");
    expect(tenantAUsers).toHaveLength(1);
    expect(tenantAUsers[0].email).toBe("user@a.com");

    const tenantBUsers = await getUsers("tenant-b");
    expect(tenantBUsers).toHaveLength(1);
    expect(tenantBUsers[0].email).toBe("user@b.com");
  });

  it("should enforce organization-based access", async () => {
    // Get token for tenant-a
    const token = await getToken({ org_id: "tenant-a" });

    // Should access tenant-a
    const response = await fetch("/api/users", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.ok).toBe(true);

    // Should not access tenant-b
    const wrongResponse = await fetch("/api/users", {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Tenant-Id": "tenant-b",
      },
    });
    expect(wrongResponse.status).toBe(403);
  });
});
```

## Deployment

### Phased Rollout

1. **Phase 1: Deploy to staging**
   - Test all functionality
   - Run migration scripts
   - Verify data integrity

2. **Phase 2: Deploy to production (read-only)**
   - Deploy multi-tenancy code
   - Keep in read-only mode
   - Monitor for issues

3. **Phase 3: Enable writes**
   - Switch to full multi-tenancy
   - Monitor carefully
   - Be ready to rollback

4. **Phase 4: Clean up**
   - Remove old code
   - Archive old databases (if migrated)
   - Update documentation

### Deployment Script

```bash
#!/bin/bash
set -e

echo "🚀 Starting multi-tenancy migration..."

# 1. Backup
echo "📦 Creating backup..."
./scripts/backup.sh

# 2. Deploy new code
echo "📤 Deploying code..."
pnpm run deploy

# 3. Run migrations
echo "🔄 Running migrations..."
pnpm run migrate

# 4. Verify
echo "✅ Verifying deployment..."
pnpm run verify

echo "✨ Migration complete!"
```

## Rollback Plan

If issues occur, be prepared to rollback:

### Rollback Steps

1. **Stop serving traffic** (if possible)
2. **Revert code deployment**
3. **Restore database backup**
4. **Verify functionality**
5. **Resume traffic**

### Rollback Script

```bash
#!/bin/bash
set -e

echo "⏪ Rolling back multi-tenancy migration..."

# 1. Stop traffic (optional)
echo "🛑 Stopping traffic..."
# cloudflare wrangler pages deployment rollback

# 2. Restore backup
echo "📦 Restoring backup..."
./scripts/restore.sh backup-20231201.sql

# 3. Deploy previous version
echo "📤 Deploying previous version..."
git checkout previous-version
pnpm run deploy

# 4. Verify
echo "✅ Verifying rollback..."
pnpm run verify

echo "✨ Rollback complete!"
```

## Common Issues

### Issue 1: Token Validation Failures

**Symptom:** Users can't access tenant resources

**Solution:**

- Verify `org_id` claim in tokens
- Check organization exists on main tenant
- Ensure user is member of organization

```typescript
// Debug token
const decoded = jwt.decode(token);
console.log("org_id:", decoded.org_id);

// Check organization
const org = await getOrganization(decoded.org_id);
console.log("Organization:", org);
```

### Issue 2: Data Access Issues

**Symptom:** Some data is inaccessible after migration

**Solution:**

- Verify data was migrated correctly
- Check tenant_id scoping
- Ensure database connections are correct

```typescript
// Verify data counts
const sourceCount = await sourceDb.query(
  "SELECT COUNT(*) FROM users WHERE tenant_id = ?",
  [tenantId],
);
const targetCount = await targetDb.query("SELECT COUNT(*) FROM users");
console.log("Source:", sourceCount, "Target:", targetCount);
```

### Issue 3: Performance Degradation

**Symptom:** Slower response times after migration

**Solution:**

- Add indexes on tenant_id columns
- Implement connection pooling
- Cache subdomain resolutions
- Use read replicas

```typescript
// Add indexes
await db.exec(`
  CREATE INDEX idx_users_tenant_id ON users(tenant_id);
  CREATE INDEX idx_applications_tenant_id ON applications(tenant_id);
`);
```

## Best Practices

### 1. Test Thoroughly

Test the migration extensively before production:

```typescript
// Test script
async function runMigrationTests() {
  await testTenantIsolation();
  await testAccessControl();
  await testDataMigration();
  await testPerformance();
}
```

### 2. Monitor Closely

Set up monitoring during and after migration:

```typescript
// Monitor key metrics
monitor.track({
  metric: "tenant_requests",
  value: requestCount,
  tags: { tenant_id: tenantId },
});
```

### 3. Document Changes

Update documentation for your team:

- API changes
- Authentication flow changes
- New environment variables
- Configuration options

### 4. Communicate

Inform stakeholders about:

- Migration timeline
- Expected downtime (if any)
- Changes to access patterns
- New features available

## Next Steps

- [Architecture](./architecture.md) - Understanding the multi-tenancy model
- [Database Isolation](./database-isolation.md) - Learn about per-tenant databases
- [API Reference](./api-reference.md) - Complete API documentation
