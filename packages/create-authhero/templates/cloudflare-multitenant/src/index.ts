import { OpenAPIHono } from "@hono/zod-openapi";
import { D1Dialect } from "kysely-d1";
import { Kysely } from "kysely";
import createKyselyAdapters from "@authhero/kysely-adapter";
import createCloudflareAdapters from "@authhero/cloudflare-adapter";
import { createMultiTenancyPlugin } from "@authhero/multi-tenancy";
import createApp from "./app";
import { Env } from "./types";
import { AuthHeroConfig, Bindings, Variables } from "authhero";
import { createDatabaseFactory } from "./database-factory";

let app: OpenAPIHono<{ Bindings: Bindings; Variables: Variables }> | undefined;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!app) {
      // Create main database adapters
      const mainDialect = new D1Dialect({ database: env.MAIN_DB });
      const mainDb = new Kysely<any>({ dialect: mainDialect });
      const mainDataAdapter = createKyselyAdapters(mainDb);

      // Create database factory for multi-tenant database isolation
      const databaseFactory = createDatabaseFactory(
        env.MAIN_DB,
        env.CLOUDFLARE_ACCOUNT_ID,
        env.CLOUDFLARE_API_TOKEN,
        env.MAIN_TENANT_ID,
      );

      // Create Cloudflare-specific adapters (cache, custom domains, geo)
      const cloudflareAdapters = createCloudflareAdapters({
        accountId: env.CLOUDFLARE_ACCOUNT_ID,
        apiToken: env.CLOUDFLARE_API_TOKEN,
        // Analytics Engine for logs
        analyticsEngineLogs: {
          analyticsEngineBinding: env.AUTH_LOGS,
          accountId: env.CLOUDFLARE_ACCOUNT_ID,
          apiToken: env.ANALYTICS_ENGINE_API_TOKEN || env.CLOUDFLARE_API_TOKEN,
          dataset: "authhero_logs",
        },
      });

      // Create multi-tenancy plugin
      const multiTenancyPlugin = createMultiTenancyPlugin({
        accessControl: {
          mainTenantId: env.MAIN_TENANT_ID,
          defaultPermissions: ["tenant:admin", "tenant:read", "tenant:write"],
        },
        subdomainRouting: env.BASE_DOMAIN
          ? {
              baseDomain: env.BASE_DOMAIN,
            }
          : undefined,
        databaseIsolation: {
          getAdapters: databaseFactory.getAdapters,
          onProvision: databaseFactory.provision,
          onDeprovision: databaseFactory.deprovision,
        },
      });

      const config: AuthHeroConfig = {
        dataAdapter: mainDataAdapter,
        ...cloudflareAdapters,
      };

      app = createApp(config, multiTenancyPlugin);
    }

    return app.fetch(request, { env });
  },
};
