import { and, asc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import type {
  HandlerConfig,
  ListProxyRoutesParams,
  ListProxyRoutesResult,
  ProxyRoute,
  ProxyRouteInsert,
  ProxyRouteUpdate,
  ProxyRoutesAdapter,
  RouteMatch,
} from "@authhero/adapter-interfaces";
import { handlerConfigSchema, matchSchema } from "@authhero/adapter-interfaces";
import { proxyRoutes as proxyRoutesTable } from "../schema/sqlite";
import type { DrizzleDb } from "./types";

function parseMatch(raw: string | null | undefined): RouteMatch {
  if (!raw) return { path: "/*" };
  try {
    const parsed: unknown = JSON.parse(raw);
    const validated = matchSchema.safeParse(parsed);
    if (validated.success) return validated.data;
  } catch {
    /* fall through */
  }
  return { path: "/*" };
}

function parseHandlers(raw: string | null | undefined): HandlerConfig[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const result: HandlerConfig[] = [];
    for (const entry of parsed) {
      const validated = handlerConfigSchema.safeParse(entry);
      if (validated.success) result.push(validated.data);
    }
    return result;
  } catch {
    return [];
  }
}

function rowToProxyRoute(
  row: typeof proxyRoutesTable.$inferSelect,
): ProxyRoute {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    custom_domain_id: row.custom_domain_id,
    priority: row.priority,
    match: parseMatch(row.match),
    handlers: parseHandlers(row.handlers),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function createProxyRoutesAdapter(db: DrizzleDb): ProxyRoutesAdapter {
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

      await db.insert(proxyRoutesTable).values({
        id: route.id,
        tenant_id: route.tenant_id,
        custom_domain_id: route.custom_domain_id,
        priority: route.priority,
        match: JSON.stringify(route.match),
        handlers: JSON.stringify(route.handlers),
        created_at: route.created_at,
        updated_at: route.updated_at,
      });

      return route;
    },

    async get(tenant_id: string, id: string): Promise<ProxyRoute | null> {
      const rows = await db
        .select()
        .from(proxyRoutesTable)
        .where(
          and(
            eq(proxyRoutesTable.tenant_id, tenant_id),
            eq(proxyRoutesTable.id, id),
          ),
        )
        .limit(1);
      return rows[0] ? rowToProxyRoute(rows[0]) : null;
    },

    async list(
      tenant_id: string,
      params: ListProxyRoutesParams = {},
    ): Promise<ListProxyRoutesResult> {
      const page = params.page ?? 0;
      const per_page = params.per_page ?? 50;

      const conditions = [eq(proxyRoutesTable.tenant_id, tenant_id)];
      if (params.custom_domain_id) {
        conditions.push(
          eq(proxyRoutesTable.custom_domain_id, params.custom_domain_id),
        );
      }

      const rows = await db
        .select()
        .from(proxyRoutesTable)
        .where(and(...conditions))
        .orderBy(
          asc(proxyRoutesTable.priority),
          asc(proxyRoutesTable.created_at),
        )
        .offset(page * per_page)
        .limit(per_page);

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
        .update(proxyRoutesTable)
        .set(set)
        .where(
          and(
            eq(proxyRoutesTable.tenant_id, tenant_id),
            eq(proxyRoutesTable.id, id),
          ),
        );
      const changes = (result as { changes?: number } | undefined)?.changes;
      if (typeof changes === "number") return changes > 0;
      const after = await db
        .select({ id: proxyRoutesTable.id })
        .from(proxyRoutesTable)
        .where(
          and(
            eq(proxyRoutesTable.tenant_id, tenant_id),
            eq(proxyRoutesTable.id, id),
          ),
        )
        .limit(1);
      return after.length > 0;
    },

    async remove(tenant_id: string, id: string): Promise<boolean> {
      const before = await db
        .select({ id: proxyRoutesTable.id })
        .from(proxyRoutesTable)
        .where(
          and(
            eq(proxyRoutesTable.tenant_id, tenant_id),
            eq(proxyRoutesTable.id, id),
          ),
        )
        .limit(1);
      if (before.length === 0) return false;

      await db
        .delete(proxyRoutesTable)
        .where(
          and(
            eq(proxyRoutesTable.tenant_id, tenant_id),
            eq(proxyRoutesTable.id, id),
          ),
        );
      return true;
    },
  };
}
