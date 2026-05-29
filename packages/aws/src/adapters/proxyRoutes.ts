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
import { DynamoDBContext, DynamoDBBaseItem } from "../types";
import { proxyRouteKeys } from "../keys";
import {
  deleteItem,
  getItem,
  putItem,
  queryItems,
  removeNullProperties,
  stripDynamoDBFields,
  updateItem,
} from "../utils";

interface ProxyRouteItem extends DynamoDBBaseItem {
  id: string;
  tenant_id: string;
  custom_domain_id: string;
  priority: number;
  match: string; // JSON-encoded RouteMatch
  handlers: string; // JSON-encoded HandlerConfig[]
}

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

function toProxyRoute(item: ProxyRouteItem): ProxyRoute {
  const { match, handlers, ...rest } = stripDynamoDBFields(item);
  return removeNullProperties({
    ...rest,
    match: parseMatch(match),
    handlers: parseHandlers(handlers),
  }) as ProxyRoute;
}

function sortRoutes(rows: ProxyRouteItem[]): ProxyRouteItem[] {
  return [...rows].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.created_at.localeCompare(b.created_at);
  });
}

export function createProxyRoutesAdapter(
  ctx: DynamoDBContext,
): ProxyRoutesAdapter {
  return {
    async create(
      tenant_id: string,
      input: ProxyRouteInsert,
    ): Promise<ProxyRoute> {
      const now = new Date().toISOString();
      const id = nanoid();

      const item: ProxyRouteItem = {
        PK: proxyRouteKeys.pk(tenant_id),
        SK: proxyRouteKeys.sk(id),
        GSI1PK: proxyRouteKeys.gsi1pk(tenant_id, input.custom_domain_id),
        GSI1SK: proxyRouteKeys.gsi1sk(id),
        entityType: "PROXY_ROUTE",
        tenant_id,
        id,
        custom_domain_id: input.custom_domain_id,
        priority: input.priority,
        match: JSON.stringify(input.match),
        handlers: JSON.stringify(input.handlers),
        created_at: now,
        updated_at: now,
      };

      await putItem(ctx, item);
      return toProxyRoute(item);
    },

    async get(tenant_id: string, id: string): Promise<ProxyRoute | null> {
      const item = await getItem<ProxyRouteItem>(
        ctx,
        proxyRouteKeys.pk(tenant_id),
        proxyRouteKeys.sk(id),
      );
      return item ? toProxyRoute(item) : null;
    },

    async list(
      tenant_id: string,
      params: ListProxyRoutesParams = {},
    ): Promise<ListProxyRoutesResult> {
      const page = params.page ?? 0;
      const per_page = params.per_page ?? 50;

      let items: ProxyRouteItem[];
      if (params.custom_domain_id) {
        const { items: rows } = await queryItems<ProxyRouteItem>(
          ctx,
          proxyRouteKeys.gsi1pk(tenant_id, params.custom_domain_id),
          { indexName: "GSI1" },
        );
        items = rows;
      } else {
        const { items: rows } = await queryItems<ProxyRouteItem>(
          ctx,
          proxyRouteKeys.pk(tenant_id),
          { skPrefix: "PROXY_ROUTE#" },
        );
        items = rows;
      }

      const sorted = sortRoutes(items);
      const sliced = sorted.slice(page * per_page, page * per_page + per_page);
      return {
        proxy_routes: sliced.map(toProxyRoute),
        start: page * per_page,
        limit: per_page,
        length: sliced.length,
      };
    },

    async update(
      tenant_id: string,
      id: string,
      input: ProxyRouteUpdate,
    ): Promise<boolean> {
      const updates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (input.priority !== undefined) updates.priority = input.priority;
      if (input.match !== undefined)
        updates.match = JSON.stringify(input.match);
      if (input.handlers !== undefined)
        updates.handlers = JSON.stringify(input.handlers);

      const existing = await getItem<ProxyRouteItem>(
        ctx,
        proxyRouteKeys.pk(tenant_id),
        proxyRouteKeys.sk(id),
      );
      if (!existing) return false;

      return updateItem(
        ctx,
        proxyRouteKeys.pk(tenant_id),
        proxyRouteKeys.sk(id),
        updates,
      );
    },

    async remove(tenant_id: string, id: string): Promise<boolean> {
      const existing = await getItem<ProxyRouteItem>(
        ctx,
        proxyRouteKeys.pk(tenant_id),
        proxyRouteKeys.sk(id),
      );
      if (!existing) return false;

      return deleteItem(
        ctx,
        proxyRouteKeys.pk(tenant_id),
        proxyRouteKeys.sk(id),
      );
    },
  };
}
