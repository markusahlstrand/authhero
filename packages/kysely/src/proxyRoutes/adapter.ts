import { Kysely } from "kysely";
import { nanoid } from "nanoid";
import {
  ListProxyRoutesParams,
  ListProxyRoutesResult,
  ProxyRoute,
  ProxyRouteInsert,
  ProxyRouteUpdate,
  ProxyRoutesAdapter,
} from "@authhero/adapter-interfaces";
import { Database } from "../db";
import { rowToProxyRoute } from "./serialize";

export function createProxyRoutesAdapter(
  db: Kysely<Database>,
): ProxyRoutesAdapter {
  return {
    async create(
      tenant_id: string,
      input: ProxyRouteInsert,
    ): Promise<ProxyRoute> {
      const now = new Date().toISOString();
      const route: ProxyRoute = {
        id: nanoid(),
        tenant_id,
        custom_domain_id: input.custom_domain_id,
        priority: input.priority,
        match: input.match,
        handlers: input.handlers,
        created_at: now,
        updated_at: now,
      };

      await db
        .insertInto("proxy_routes")
        .values({
          id: route.id,
          tenant_id: route.tenant_id,
          custom_domain_id: route.custom_domain_id,
          priority: route.priority,
          match: JSON.stringify(route.match),
          handlers: JSON.stringify(route.handlers),
          created_at: route.created_at,
          updated_at: route.updated_at,
        })
        .execute();

      return route;
    },

    async get(tenant_id: string, id: string): Promise<ProxyRoute | null> {
      const row = await db
        .selectFrom("proxy_routes")
        .where("tenant_id", "=", tenant_id)
        .where("id", "=", id)
        .selectAll()
        .executeTakeFirst();
      return row ? rowToProxyRoute(row) : null;
    },

    async list(
      tenant_id: string,
      params: ListProxyRoutesParams = {},
    ): Promise<ListProxyRoutesResult> {
      const page = params.page ?? 0;
      const per_page = params.per_page ?? 50;

      let query = db
        .selectFrom("proxy_routes")
        .where("tenant_id", "=", tenant_id);

      if (params.custom_domain_id) {
        query = query.where("custom_domain_id", "=", params.custom_domain_id);
      }

      const rows = await query
        .selectAll()
        .orderBy("priority", "asc")
        .orderBy("created_at", "asc")
        .offset(page * per_page)
        .limit(per_page)
        .execute();

      return {
        proxy_routes: rows.map(rowToProxyRoute),
        start: page * per_page,
        limit: per_page,
        length: rows.length,
      };
    },

    async update(
      tenant_id: string,
      id: string,
      input: ProxyRouteUpdate,
    ): Promise<boolean> {
      const set: Record<string, string | number> = {
        updated_at: new Date().toISOString(),
      };
      if (input.priority !== undefined) set.priority = input.priority;
      if (input.match !== undefined) set.match = JSON.stringify(input.match);
      if (input.handlers !== undefined)
        set.handlers = JSON.stringify(input.handlers);

      const result = await db
        .updateTable("proxy_routes")
        .where("tenant_id", "=", tenant_id)
        .where("id", "=", id)
        .set(set)
        .executeTakeFirst();

      return Number(result.numUpdatedRows) > 0;
    },

    async remove(tenant_id: string, id: string): Promise<boolean> {
      const result = await db
        .deleteFrom("proxy_routes")
        .where("tenant_id", "=", tenant_id)
        .where("id", "=", id)
        .executeTakeFirst();
      return Number(result.numDeletedRows) > 0;
    },
  };
}
