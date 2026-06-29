import { Kysely } from "kysely";
import {
  OrganizationConnection,
  OrganizationConnectionInsert,
  OrganizationConnectionsAdapter,
} from "@authhero/adapter-interfaces";
import { Database } from "../db";

type Row = Database["organization_connections"];

function toDomain(
  row: Row,
  connection?: { name: string; strategy?: string },
): OrganizationConnection {
  // SQLite returns 0/1, MySQL returns true/false — normalize both.
  return {
    connection_id: row.connection_id,
    assign_membership_on_login: Boolean(row.assign_membership_on_login),
    show_as_button: Boolean(row.show_as_button),
    is_signup_enabled: Boolean(row.is_signup_enabled),
    connection: connection
      ? { name: connection.name, strategy: connection.strategy }
      : undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function loadConnection(
  db: Kysely<Database>,
  tenantId: string,
  connectionId: string,
): Promise<{ name: string; strategy?: string } | undefined> {
  const conn = await db
    .selectFrom("connections")
    .select(["name", "strategy"])
    .where("tenant_id", "=", tenantId)
    .where("id", "=", connectionId)
    .executeTakeFirst();
  if (!conn) return undefined;
  // The flatten/extend chain in db.ts widens these to `unknown` at the type
  // level even though the DB columns are varchar.
  return {
    name: conn.name as string,
    strategy: typeof conn.strategy === "string" ? conn.strategy : undefined,
  };
}

export function createOrganizationConnectionsAdapter(
  db: Kysely<Database>,
): OrganizationConnectionsAdapter {
  return {
    async create(
      tenantId,
      organizationId,
      params: OrganizationConnectionInsert,
      options,
    ) {
      const importMetadata = options?.importMetadata;
      const now = new Date().toISOString();
      const row: Row = {
        tenant_id: tenantId,
        organization_id: organizationId,
        connection_id: params.connection_id,
        assign_membership_on_login: params.assign_membership_on_login ? 1 : 0,
        show_as_button: params.show_as_button === false ? 0 : 1,
        is_signup_enabled: params.is_signup_enabled === false ? 0 : 1,
        created_at: importMetadata?.created_at ?? now,
        updated_at: importMetadata?.updated_at ?? now,
      };
      await db.insertInto("organization_connections").values(row).execute();
      const connection = await loadConnection(
        db,
        tenantId,
        params.connection_id,
      );
      return toDomain(row, connection);
    },

    async list(tenantId, organizationId) {
      const rows = await db
        .selectFrom("organization_connections")
        .selectAll()
        .where("tenant_id", "=", tenantId)
        .where("organization_id", "=", organizationId)
        .execute();
      const out: OrganizationConnection[] = [];
      for (const row of rows) {
        const connection = await loadConnection(
          db,
          tenantId,
          row.connection_id,
        );
        out.push(toDomain(row, connection));
      }
      return out;
    },

    async get(tenantId, organizationId, connectionId) {
      const row = await db
        .selectFrom("organization_connections")
        .selectAll()
        .where("tenant_id", "=", tenantId)
        .where("organization_id", "=", organizationId)
        .where("connection_id", "=", connectionId)
        .executeTakeFirst();
      if (!row) return null;
      const connection = await loadConnection(db, tenantId, connectionId);
      return toDomain(row, connection);
    },

    async update(tenantId, organizationId, connectionId, params) {
      const updates: Partial<Row> = { updated_at: new Date().toISOString() };
      if (params.assign_membership_on_login !== undefined) {
        updates.assign_membership_on_login = params.assign_membership_on_login
          ? 1
          : 0;
      }
      if (params.show_as_button !== undefined) {
        updates.show_as_button = params.show_as_button ? 1 : 0;
      }
      if (params.is_signup_enabled !== undefined) {
        updates.is_signup_enabled = params.is_signup_enabled ? 1 : 0;
      }
      const result = await db
        .updateTable("organization_connections")
        .set(updates)
        .where("tenant_id", "=", tenantId)
        .where("organization_id", "=", organizationId)
        .where("connection_id", "=", connectionId)
        .executeTakeFirst();
      if (Number(result.numUpdatedRows ?? 0) === 0) return null;
      const row = await db
        .selectFrom("organization_connections")
        .selectAll()
        .where("tenant_id", "=", tenantId)
        .where("organization_id", "=", organizationId)
        .where("connection_id", "=", connectionId)
        .executeTakeFirst();
      if (!row) return null;
      const connection = await loadConnection(db, tenantId, connectionId);
      return toDomain(row, connection);
    },

    async remove(tenantId, organizationId, connectionId) {
      const result = await db
        .deleteFrom("organization_connections")
        .where("tenant_id", "=", tenantId)
        .where("organization_id", "=", organizationId)
        .where("connection_id", "=", connectionId)
        .executeTakeFirst();
      return Number(result.numDeletedRows ?? 0) > 0;
    },
  };
}
