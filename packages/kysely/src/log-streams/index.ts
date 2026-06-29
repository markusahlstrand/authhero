import { Kysely } from "kysely";
import { nanoid } from "nanoid";
import {
  LogStream,
  LogStreamInsert,
  LogStreamsAdapter,
  CreateOptions,
} from "@authhero/adapter-interfaces";
import { Database } from "../db";

type Row = Database["log_streams"];

function fromRow(row: Row): LogStream {
  return {
    id: row.id,
    name: row.name,
    type: row.type as LogStream["type"],
    status: row.status as LogStream["status"],
    sink: JSON.parse(row.sink),
    filters: row.filters ? JSON.parse(row.filters) : undefined,
    isPriority: row.is_priority == null ? undefined : row.is_priority === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function createLogStreamsAdapter(
  db: Kysely<Database>,
): LogStreamsAdapter {
  return {
    async create(
      tenant_id,
      params: LogStreamInsert,
      options?: CreateOptions,
    ): Promise<LogStream> {
      const importMetadata = options?.importMetadata;
      const now = new Date().toISOString();
      const id = importMetadata?.id ?? `lst_${nanoid()}`;
      const row: Row = {
        id,
        tenant_id,
        name: params.name,
        type: params.type,
        status: params.status ?? "active",
        sink: JSON.stringify(params.sink),
        filters: params.filters ? JSON.stringify(params.filters) : null,
        is_priority:
          params.isPriority === undefined ? null : params.isPriority ? 1 : 0,
        created_at: importMetadata?.created_at ?? now,
        updated_at: importMetadata?.updated_at ?? now,
      };
      await db.insertInto("log_streams").values(row).execute();
      return fromRow(row);
    },

    async get(tenant_id, id) {
      const row = await db
        .selectFrom("log_streams")
        .where("tenant_id", "=", tenant_id)
        .where("id", "=", id)
        .selectAll()
        .executeTakeFirst();
      return row ? fromRow(row) : null;
    },

    async list(tenant_id) {
      const rows = await db
        .selectFrom("log_streams")
        .where("tenant_id", "=", tenant_id)
        .selectAll()
        .execute();
      return rows.map(fromRow);
    },

    async update(tenant_id, id, params) {
      const patch: Partial<Row> = { updated_at: new Date().toISOString() };
      if (params.name !== undefined) patch.name = params.name;
      if (params.type !== undefined) patch.type = params.type;
      if (params.status !== undefined) patch.status = params.status;
      if (params.sink !== undefined) patch.sink = JSON.stringify(params.sink);
      if (params.filters !== undefined) {
        patch.filters = params.filters ? JSON.stringify(params.filters) : null;
      }
      if (params.isPriority !== undefined) {
        patch.is_priority = params.isPriority ? 1 : 0;
      }

      const result = await db
        .updateTable("log_streams")
        .set(patch)
        .where("tenant_id", "=", tenant_id)
        .where("id", "=", id)
        .executeTakeFirst();
      return (result?.numUpdatedRows ?? 0n) > 0n;
    },

    async remove(tenant_id, id) {
      const result = await db
        .deleteFrom("log_streams")
        .where("tenant_id", "=", tenant_id)
        .where("id", "=", id)
        .executeTakeFirst();
      return (result?.numDeletedRows ?? 0n) > 0n;
    },
  };
}
