import { Kysely } from "kysely";
import { HTTPException } from "hono/http-exception";
import { removeNullProperties } from "../helpers/remove-nulls";
import { Client, connectionSchema } from "@authhero/adapter-interfaces";
import { Database } from "../db";

export function createClientsAdapter(db: Kysely<Database>) {
  return {
    get: async (applicationId: string) => {
      const application = await db
        .selectFrom("applications")
        .selectAll()
        .where("id", "=", applicationId)
        .executeTakeFirst();

      if (!application) {
        return null;
      }

      const tenant = await db
        .selectFrom("tenants")
        .selectAll()
        .where("id", "=", application.tenant_id)
        .executeTakeFirst();

      if (!tenant) {
        throw new HTTPException(404, { message: "Tenant not found" });
      }

      const connections = await db
        .selectFrom("connections")
        .where("tenant_id", "=", application.tenant_id)
        .selectAll()
        .execute();

      const domains = await db
        .selectFrom("domains")
        .where("tenant_id", "=", application.tenant_id)
        .selectAll()
        .execute();

      const client: Client = {
        ...application,
        connections: connections.map((connection) =>
          connectionSchema.parse(removeNullProperties(connection)),
        ),
        domains,
        addons: application.addons ? JSON.parse(application.addons) : {},
        callbacks: application.callbacks
          ? JSON.parse(application.callbacks)
          : [],
        allowed_origins: application.allowed_origins
          ? JSON.parse(application.allowed_origins)
          : [],
        web_origins: application.web_origins
          ? JSON.parse(application.web_origins)
          : [],
        allowed_logout_urls: application.allowed_logout_urls
          ? JSON.parse(application.allowed_logout_urls)
          : [],
        allowed_clients: application.allowed_clients
          ? JSON.parse(application.allowed_clients)
          : [],
        tenant: removeNullProperties(tenant),
        // this is really an integer in the database
        disable_sign_ups: !!application.disable_sign_ups,
      };

      return client;
    },
  };
}
