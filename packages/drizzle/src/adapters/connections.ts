import { eq, and, count as countFn, asc, desc } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import type { Connection, ListParams } from "@authhero/adapter-interfaces";
import { connections } from "../schema/sqlite";
import {
  removeNullProperties,
  parseJsonIfString,
} from "../helpers/transform";
import { buildLuceneFilter } from "../helpers/filter";
import type { DrizzleDb } from "./types";

function generateConnectionId(): string {
  const { customAlphabet } = require("nanoid");
  const generate = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 17);
  return `con_${generate()}`;
}

function sqlToConnection(row: any): Connection {
  const { tenant_id: _, is_system, options, metadata, ...rest } = row;
  return removeNullProperties({
    ...rest,
    options: parseJsonIfString(options, {}),
    metadata: parseJsonIfString(metadata),
    is_system: is_system ? true : undefined,
  });
}

export function createConnectionsAdapter(db: DrizzleDb) {
  return {
    async create(tenant_id: string, params: any): Promise<Connection> {
      const now = new Date().toISOString();
      const connection = {
        id: params.id || generateConnectionId(),
        ...params,
        tenant_id,
        options: JSON.stringify(params.options || {}),
        metadata: params.metadata ? JSON.stringify(params.metadata) : undefined,
        is_system: params.is_system ? 1 : 0,
        created_at: now,
        updated_at: now,
      };

      try {
        await db.insert(connections).values(connection);
      } catch (error: any) {
        if (
          error?.message?.includes("UNIQUE constraint failed") ||
          error?.message?.includes("duplicate key")
        ) {
          throw new HTTPException(409, {
            message: `Connection already exists`,
          });
        }
        throw error;
      }

      return sqlToConnection(connection);
    },

    async get(tenant_id: string, connection_id: string): Promise<Connection | null> {
      const result = await db
        .select()
        .from(connections)
        .where(
          and(
            eq(connections.tenant_id, tenant_id),
            eq(connections.id, connection_id),
          ),
        )
        .get();

      if (!result) return null;
      return sqlToConnection(result);
    },

    async update(
      tenant_id: string,
      connection_id: string,
      params: Partial<Connection>,
    ): Promise<boolean> {
      const updateData: any = {
        updated_at: new Date().toISOString(),
      };

      if (params.name !== undefined) updateData.name = params.name;
      if (params.strategy !== undefined) updateData.strategy = params.strategy;
      if (params.options !== undefined)
        updateData.options = JSON.stringify(params.options);
      if (params.metadata !== undefined)
        updateData.metadata = JSON.stringify(params.metadata);
      if (params.display_name !== undefined)
        updateData.display_name = params.display_name;
      if (params.response_type !== undefined)
        updateData.response_type = params.response_type;
      if (params.response_mode !== undefined)
        updateData.response_mode = params.response_mode;

      await db
        .update(connections)
        .set(updateData)
        .where(
          and(
            eq(connections.tenant_id, tenant_id),
            eq(connections.id, connection_id),
          ),
        );

      return true;
    },

    async list(tenant_id: string, params?: ListParams) {
      const {
        page = 0,
        per_page = 50,
        include_totals = false,
        sort,
        q,
      } = params || {};

      let baseFilter = eq(connections.tenant_id, tenant_id);

      let query = db.select().from(connections).where(baseFilter).$dynamic();

      if (q) {
        const lucene = buildLuceneFilter(connections, q, ["name"]);
        if (lucene)
          query = query.where(and(eq(connections.tenant_id, tenant_id), lucene));
      }

      if (sort?.sort_by) {
        const col = (connections as any)[sort.sort_by];
        if (col) {
          query = query.orderBy(
            sort.sort_order === "desc" ? desc(col) : asc(col),
          );
        }
      }

      const results = await query.offset(page * per_page).limit(per_page);
      const mapped = results.map(sqlToConnection);

      if (!include_totals) {
        return { connections: mapped };
      }

      const [countResult] = await db
        .select({ count: countFn() })
        .from(connections)
        .where(baseFilter);

      return {
        connections: mapped,
        start: page * per_page,
        limit: per_page,
        length: Number(countResult?.count ?? 0),
      };
    },

    async remove(tenant_id: string, connection_id: string): Promise<boolean> {
      const results = await db
        .delete(connections)
        .where(
          and(
            eq(connections.tenant_id, tenant_id),
            eq(connections.id, connection_id),
          ),
        )
        .returning();

      return results.length > 0;
    },
  };
}
