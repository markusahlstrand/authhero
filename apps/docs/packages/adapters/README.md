# AuthHero Adapters

AuthHero uses a flexible adapter system to interact with different data storage solutions. This allows you to choose the database technology that best fits your application's needs.

## Available Adapters

AuthHero currently provides the following adapters:

- [Adapter Interfaces](adapter-interfaces.md) - The base interfaces for creating adapters
- [Kysely Adapter](kysely.md) - Adapter for SQL databases using the Kysely query builder
- [Drizzle Adapter](drizzle.md) - Adapter for SQL databases using the Drizzle ORM (not in a working state)
- [Cloudflare Adapter](cloudflare.md) - Adapter for Cloudflare custom domains support

## Using Adapters

When configuring AuthHero, you specify which adapter to use:

```typescript
import { AuthHero } from 'authhero';
import { KyselyAdapter } from 'authhero-kysely-adapter';

const db = // your database connection
const adapter = new KyselyAdapter(db);

const authHero = new AuthHero({
  adapter,
  // other configuration options
});
```

## Creating Custom Adapters

You can create custom adapters by implementing the adapter interfaces. This allows you to integrate AuthHero with any data storage solution not officially supported.

See the [Adapter Interfaces](adapter-interfaces.md) page for details on creating custom adapters.