import { DataAdapters } from "@authhero/adapter-interfaces";
import createKyselyAdapters from "@authhero/kysely-adapter";
import { D1Dialect } from "kysely-d1";
import { Kysely, SqliteQueryCompiler } from "kysely";
import wretch from "wretch";

interface TenantDatabase {
  database_id: string;
  database_name: string;
}

// Cache for tenant database adapters
const adapterCache = new Map<string, DataAdapters>();

/**
 * Create a database factory for multi-tenant D1 databases.
 *
 * This factory:
 * - Uses the main D1 database for the main tenant
 * - Creates/connects to per-tenant D1 databases via REST API for other tenants
 */
export function createDatabaseFactory(
  mainDb: D1Database,
  accountId: string,
  apiToken: string,
  mainTenantId: string,
) {
  const mainDialect = new D1Dialect({ database: mainDb });
  const mainKysely = new Kysely<any>({ dialect: mainDialect });
  const mainAdapters = createKyselyAdapters(mainKysely);

  return {
    /**
     * Get adapters for a specific tenant
     */
    async getAdapters(tenantId: string): Promise<DataAdapters> {
      // Main tenant uses the bound D1 database
      if (tenantId === mainTenantId) {
        return mainAdapters;
      }

      // Check cache first
      const cached = adapterCache.get(tenantId);
      if (cached) {
        return cached;
      }

      // For other tenants, connect via REST API
      const adapters = await createRestD1Adapters(
        tenantId,
        mainKysely,
        accountId,
        apiToken,
      );
      adapterCache.set(tenantId, adapters);
      return adapters;
    },

    /**
     * Provision a new database for a tenant
     */
    async provision(tenantId: string): Promise<void> {
      console.log(`Provisioning database for tenant: ${tenantId}`);

      // Create a new D1 database via Cloudflare API
      const response = await wretch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database`,
      )
        .auth(`Bearer ${apiToken}`)
        .post({ name: `authhero-tenant-${tenantId}` })
        .json<{ success: boolean; result: TenantDatabase; errors: any[] }>();

      if (!response.success) {
        throw new Error(
          `Failed to create database: ${JSON.stringify(response.errors)}`,
        );
      }

      // Store the database mapping in the main database
      await mainKysely
        .insertInto("tenant_databases")
        .values({
          tenant_id: tenantId,
          database_id: response.result.database_id,
          database_name: response.result.database_name,
          created_at: new Date().toISOString(),
        })
        .execute();

      console.log(
        `Database provisioned for tenant ${tenantId}: ${response.result.database_id}`,
      );
    },

    /**
     * Deprovision (delete) a tenant's database
     */
    async deprovision(tenantId: string): Promise<void> {
      console.log(`Deprovisioning database for tenant: ${tenantId}`);

      // Get the database ID from the main database
      const mapping = await mainKysely
        .selectFrom("tenant_databases")
        .where("tenant_id", "=", tenantId)
        .selectAll()
        .executeTakeFirst();

      if (!mapping) {
        console.warn(`No database mapping found for tenant: ${tenantId}`);
        return;
      }

      // Delete the D1 database via Cloudflare API
      await wretch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${mapping.database_id}`,
      )
        .auth(`Bearer ${apiToken}`)
        .delete()
        .json();

      // Remove the mapping from the main database
      await mainKysely
        .deleteFrom("tenant_databases")
        .where("tenant_id", "=", tenantId)
        .execute();

      // Clear from cache
      adapterCache.delete(tenantId);

      console.log(`Database deprovisioned for tenant: ${tenantId}`);
    },
  };
}

/**
 * Create adapters that connect to a D1 database via REST API
 */
async function createRestD1Adapters(
  tenantId: string,
  mainKysely: Kysely<any>,
  accountId: string,
  apiToken: string,
): Promise<DataAdapters> {
  // Get the database ID from the tenant_databases table
  const mapping = await mainKysely
    .selectFrom("tenant_databases")
    .where("tenant_id", "=", tenantId)
    .select("database_id")
    .executeTakeFirst();

  if (!mapping) {
    throw new Error(`No database found for tenant: ${tenantId}`);
  }

  // Create a REST-based D1 adapter
  // Note: This uses the Cloudflare D1 HTTP API
  const restDialect = createRestD1Dialect(
    mapping.database_id,
    accountId,
    apiToken,
  );
  const db = new Kysely<any>({ dialect: restDialect });

  return createKyselyAdapters(db);
}

/**
 * Create a Kysely dialect that uses D1 REST API
 */
function createRestD1Dialect(
  databaseId: string,
  accountId: string,
  apiToken: string,
) {
  return {
    createAdapter: () => ({
      supportsCreateIfNotExists: () => true,
      supportsReturning: () => true,
      supportsTransactionalDdl: () => false,
    }),
    createDriver: () => ({
      init: async () => {},
      destroy: async () => {},
      acquireConnection: async () => ({
        executeQuery: async <R>(compiledQuery: {
          sql: string;
          parameters: readonly unknown[];
        }) => {
          const response = await wretch(
            `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`,
          )
            .auth(`Bearer ${apiToken}`)
            .post({
              sql: compiledQuery.sql,
              params: compiledQuery.parameters,
            })
            .json<{ success: boolean; result: Array<{ results: R[] }> }>();

          if (!response.success) {
            throw new Error("D1 REST query failed");
          }

          return {
            rows: response.result[0]?.results ?? [],
            numAffectedRows: BigInt(0),
            insertId: undefined,
          };
        },
        releaseConnection: async () => {},
      }),
      releaseConnection: async () => {},
    }),
    createIntrospector: (_db: Kysely<any>) => ({
      getSchemas: async () => [],
      getTables: async () => [],
      getMetadata: async () => ({ schemas: [], tables: [] }),
    }),
    createQueryCompiler: () => new SqliteQueryCompiler(),
  };
}
