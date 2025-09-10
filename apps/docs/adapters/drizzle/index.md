# Drizzle Adapter

The Drizzle adapter provides a modern TypeScript ORM experience for AuthHero using [Drizzle ORM](https://orm.drizzle.team/). It offers excellent TypeScript integration, schema migrations, and edge runtime support.

## Features

- **Excellent TypeScript Integration**: Zero-overhead type safety with compile-time validation
- **Schema Migrations**: Declarative schema management with automatic migration generation
- **Multiple Databases**: PostgreSQL, MySQL, SQLite support
- **Edge Runtime Compatible**: Works in Cloudflare Workers, Vercel Edge, and other edge environments
- **Relational Queries**: Type-safe joins and relations
- **Performance Optimized**: Minimal runtime overhead

## Installation

```bash
npm install @authhero/drizzle
```

## Configuration

### SQLite

```typescript
import { Database } from "@authhero/drizzle";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";

const sqlite = new Database("authhero.db");
const db = drizzle(sqlite);

const database = new Database({ db });
```

### PostgreSQL

```typescript
import { Database } from "@authhero/drizzle";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const queryClient = postgres(
  "postgresql://username:password@localhost/authhero",
);
const db = drizzle(queryClient);

const database = new Database({ db });
```

### MySQL

```typescript
import { Database } from "@authhero/drizzle";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";

const connection = await mysql.createConnection({
  host: "localhost",
  user: "username",
  password: "password",
  database: "authhero",
});

const db = drizzle(connection);
const database = new Database({ db });
```

## Schema Definition

The Drizzle adapter uses strongly-typed schema definitions:

```typescript
import { pgTable, varchar, boolean, timestamp } from "drizzle-orm/pg-core";

export const tenants = pgTable("tenants", {
  id: varchar("id", { length: 255 }).primaryKey(),
  name: varchar("name", { length: 255 }),
  audience: varchar("audience", { length: 255 }),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const users = pgTable(
  "users",
  {
    userId: varchar("user_id", { length: 255 }).notNull(),
    tenantId: varchar("tenant_id", { length: 255 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 255 }),
    emailVerified: boolean("email_verified").notNull(),
    // ... other fields
  },
  (table) => ({
    pk: primaryKey(table.userId, table.tenantId),
  }),
);
```

## Database Operations

### Users

```typescript
// Create a user
const user = await database.users.create({
  userId: "user_123",
  tenantId: "tenant_456",
  email: "user@example.com",
  name: "John Doe",
  provider: "auth0",
  emailVerified: true,
  isSocial: false,
  createdAt: new Date(),
  updatedAt: new Date(),
});

// Query with relations
const userWithSessions = await database.users.get("user_123", "tenant_456", {
  include: {
    sessions: true,
    permissions: true,
    roles: true,
  },
});

// Complex queries with joins
const activeUsers = await db
  .select()
  .from(users)
  .leftJoin(sessions, eq(users.userId, sessions.userId))
  .where(
    and(eq(users.tenantId, "tenant_456"), gte(sessions.expiresAt, new Date())),
  );
```

### Type-Safe Queries

```typescript
// All queries are fully typed
const result = await db
  .select({
    userId: users.userId,
    email: users.email,
    sessionCount: count(sessions.id),
  })
  .from(users)
  .leftJoin(sessions, eq(users.userId, sessions.userId))
  .where(eq(users.tenantId, tenantId))
  .groupBy(users.userId);

// TypeScript knows the exact shape of result
type UserWithSessionCount = (typeof result)[0];
```

## Migrations

Drizzle uses a declarative approach to migrations. You define your schema, and Drizzle generates the migrations:

```bash
# Generate migrations
npx drizzle-kit generate:pg

# Run migrations
npx drizzle-kit migrate:pg
```

### Migration Configuration

```typescript
// drizzle.config.ts
import type { Config } from "drizzle-kit";

export default {
  schema: "./src/schema.ts",
  out: "./migrations",
  driver: "pg",
  dbCredentials: {
    connectionString: process.env.DATABASE_URL!,
  },
} satisfies Config;
```

### Schema Evolution

```typescript
// Add a new column
export const users = pgTable("users", {
  // ... existing columns
  lastLoginAt: timestamp("last_login_at"), // New column
});

// Drizzle will generate the appropriate ALTER TABLE migration
```

## Edge Runtime Support

The Drizzle adapter works excellently in edge environments:

```typescript
// Cloudflare Workers
import { Database } from "@authhero/drizzle";
import { drizzle } from "drizzle-orm/d1";

export default {
  async fetch(request: Request, env: Env) {
    const db = drizzle(env.DB); // D1 binding
    const database = new Database({ db });

    // All database operations work in edge runtime
    const user = await database.users.get(userId, tenantId);

    return new Response(JSON.stringify(user));
  },
};
```

## Advanced Features

### Custom Types

```typescript
import { customType } from "drizzle-orm/pg-core";

const jsonb = customType<{ data: any }>({
  dataType() {
    return "jsonb";
  },
  toDriver(value) {
    return JSON.stringify(value);
  },
  fromDriver(value) {
    return JSON.parse(value as string);
  },
});

export const users = pgTable("users", {
  // ... other columns
  metadata: jsonb("metadata"),
});
```

### Transactions

```typescript
await db.transaction(async (tx) => {
  const user = await tx.insert(users).values(newUser);
  await tx.insert(passwords).values({
    userId: user.userId,
    tenantId: user.tenantId,
    password: hashedPassword,
  });
});
```

### Query Building

```typescript
// Dynamic query building
const query = db.select().from(users);

if (search) {
  query.where(ilike(users.email, `%${search}%`));
}

if (includeInactive) {
  query.where(eq(users.isActive, true));
}

const results = await query.limit(limit).offset(offset);
```

## Performance Optimization

### Prepared Statements

```typescript
const getUserById = db
  .select()
  .from(users)
  .where(eq(users.userId, placeholder("userId")))
  .prepare();

// Reuse prepared statement
const user = await getUserById.execute({ userId: "user_123" });
```

### Batch Operations

```typescript
// Batch inserts
await db.insert(users).values([
  { userId: "user_1", tenantId: "tenant_1", email: "user1@example.com" },
  { userId: "user_2", tenantId: "tenant_1", email: "user2@example.com" },
  // ... more users
]);

// Batch updates
await db
  .update(users)
  .set({ lastLoginAt: new Date() })
  .where(inArray(users.userId, userIds));
```

## Development Tools

### Drizzle Studio

Drizzle includes a web-based database browser:

```bash
npx drizzle-kit studio
```

This opens a local web interface for exploring your database schema and data.

### Type Generation

Generate TypeScript types from your schema:

```bash
npx drizzle-kit introspect:pg
```

## Production Considerations

### Connection Pooling

```typescript
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const queryClient = postgres(databaseUrl, {
  max: 20, // Maximum connections
  idle_timeout: 20, // Idle timeout in seconds
  connect_timeout: 30, // Connection timeout
});

const db = drizzle(queryClient);
```

### Read Replicas

```typescript
// Separate read and write connections
const writeDb = drizzle(writeConnection);
const readDb = drizzle(readConnection);

const database = new Database({
  db: writeDb,
  readDb: readDb,
});
```

## Troubleshooting

### Common Issues

1. **Migration Conflicts**: Use `drizzle-kit drop` to reset migrations in development
2. **Type Errors**: Ensure schema types match database columns exactly
3. **Connection Issues**: Verify database credentials and network connectivity
4. **Performance**: Use prepared statements for frequently executed queries

### Debug Mode

```typescript
const db = drizzle(connection, {
  logger: true, // Enable query logging
});
```

This will log all SQL queries to the console, helping with debugging and performance optimization.
