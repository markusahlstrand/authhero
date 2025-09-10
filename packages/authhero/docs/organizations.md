# Organization Management

This document demonstrates how to use the Organizations adapter for managing organizations in AuthHero.

## Type Definition

The Organization type includes the following fields:

```typescript
interface Organization {
  id: string;
  name: string;
  display_name?: string;
  branding?: {
    logo_url?: string;
    colors?: {
      primary?: string;
      page_background?: string;
    };
  };
  metadata: Record<string, any>;
  enabled_connections: Array<{
    connection_id: string;
    assign_membership_on_login: boolean;
    show_as_button: boolean;
    is_signup_enabled: boolean;
  }>;
  token_quota?: {
    client_credentials?: {
      enforce: boolean;
      per_day: number;
      per_hour: number;
    };
  };
  created_at: string;
  updated_at: string;
}
```

## CRUD Operations

### Create an Organization

```typescript
import { OrganizationInsert } from "@authhero/adapter-interfaces";

const organizationData: OrganizationInsert = {
  name: "Acme Corporation",
  display_name: "Acme Corp",
  branding: {
    logo_url: "https://acme.com/logo.png",
    colors: {
      primary: "#1E40AF",
      page_background: "#F8FAFC",
    },
  },
  metadata: {
    industry: "Technology",
    location: "San Francisco",
  },
  enabled_connections: [
    {
      connection_id: "google-oauth2",
      assign_membership_on_login: true,
      show_as_button: true,
      is_signup_enabled: true,
    },
    {
      connection_id: "email",
      assign_membership_on_login: false,
      show_as_button: true,
      is_signup_enabled: true,
    },
  ],
  token_quota: {
    client_credentials: {
      enforce: true,
      per_day: 10000,
      per_hour: 1000,
    },
  },
};

const organization = await adapters.organizations.create(
  "tenant-id",
  organizationData,
);
console.log("Created organization:", organization.id);
```

### Get an Organization

```typescript
const organization = await adapters.organizations.get("tenant-id", "org-id");
if (organization) {
  console.log("Organization name:", organization.name);
} else {
  console.log("Organization not found");
}
```

### List Organizations

```typescript
const result = await adapters.organizations.list("tenant-id", {
  page: 1,
  per_page: 10,
});

console.log(`Found ${result.organizations.length} organizations`);
result.organizations.forEach((org) => {
  console.log(`- ${org.name} (${org.id})`);
});
```

### Update an Organization

```typescript
const updated = await adapters.organizations.update("tenant-id", "org-id", {
  display_name: "Updated Display Name",
  branding: {
    colors: {
      primary: "#DC2626",
    },
  },
});

if (updated) {
  console.log("Organization updated successfully");
}
```

### Remove an Organization

```typescript
const removed = await adapters.organizations.remove("tenant-id", "org-id");
if (removed) {
  console.log("Organization removed successfully");
}
```

## Usage with Kysely Adapter

```typescript
import createAdapters from "@authhero/kysely-adapter";
import { Kysely } from "kysely";

// Initialize your database connection
const db = new Kysely({
  // your database configuration
});

// Create adapters
const adapters = createAdapters(db);

// Now you can use the organizations adapter
const organization = await adapters.organizations.create("tenant-id", {
  name: "My Organization",
});
```

## Migration

Make sure to run the database migration to create the organizations table:

```typescript
import { migrateToLatest } from "@authhero/kysely-adapter";

await migrateToLatest(db);
```

This will create the `organizations` table with the following schema:

- `id` (varchar) - Primary key
- `tenant_id` (varchar) - Foreign key to tenant
- `name` (varchar) - Organization name
- `display_name` (varchar) - Display name (optional)
- `branding` (text) - JSON string for branding configuration
- `metadata` (text) - JSON string for custom metadata
- `enabled_connections` (text) - JSON array of enabled connections
- `token_quota` (text) - JSON string for token quota settings
- `created_at` (varchar) - ISO timestamp
- `updated_at` (varchar) - ISO timestamp
