import { eq, and, count as countFn, asc, desc } from "drizzle-orm";
import { nanoid } from "nanoid";
import type {
  Grant,
  GrantInsert,
  GrantsAdapter,
  ListParams,
} from "@authhero/adapter-interfaces";
import { grants } from "../schema/sqlite";
import { parseJsonIfString } from "../helpers/transform";
import { buildLuceneFilter } from "../helpers/filter";
import type { DrizzleDb } from "./types";

function sqlToGrant(row: {
  id: string;
  user_id: string;
  client_id: string;
  audience: string;
  scope: string | null;
}): Grant {
  return {
    id: row.id,
    user_id: row.user_id,
    clientID: row.client_id,
    audience: row.audience || undefined,
    scope: parseJsonIfString<string[]>(row.scope, []) ?? [],
  };
}

const sortableColumns = {
  user_id: grants.user_id,
  client_id: grants.client_id,
  audience: grants.audience,
  created_at: grants.created_at,
  updated_at: grants.updated_at,
};

function getSortableColumn(key: string) {
  return Object.hasOwn(sortableColumns, key)
    ? sortableColumns[key as keyof typeof sortableColumns]
    : undefined;
}

export function createGrantsAdapter(db: DrizzleDb): GrantsAdapter {
  return {
    async create(tenant_id: string, grant: GrantInsert): Promise<Grant> {
      const now = new Date().toISOString();
      const requestedScope = grant.scope ?? [];
      const audience = grant.audience ?? "";

      const existing = await db
        .select()
        .from(grants)
        .where(
          and(
            eq(grants.tenant_id, tenant_id),
            eq(grants.user_id, grant.user_id),
            eq(grants.client_id, grant.clientID),
            eq(grants.audience, audience),
          ),
        )
        .get();

      if (existing) {
        const existingScope =
          parseJsonIfString<string[]>(existing.scope, []) ?? [];
        const merged = Array.from(
          new Set([...existingScope, ...requestedScope]),
        );

        await db
          .update(grants)
          .set({ scope: JSON.stringify(merged), updated_at: now })
          .where(
            and(eq(grants.tenant_id, tenant_id), eq(grants.id, existing.id)),
          );

        return sqlToGrant({ ...existing, scope: JSON.stringify(merged) });
      }

      const id = nanoid();
      await db.insert(grants).values({
        id,
        tenant_id,
        user_id: grant.user_id,
        client_id: grant.clientID,
        audience,
        scope: JSON.stringify(requestedScope),
        created_at: now,
        updated_at: now,
      });

      return {
        id,
        user_id: grant.user_id,
        clientID: grant.clientID,
        audience: audience || undefined,
        scope: requestedScope,
      };
    },

    async get(
      tenant_id: string,
      user_id: string,
      clientID: string,
      audience?: string,
    ): Promise<Grant | null> {
      const row = await db
        .select()
        .from(grants)
        .where(
          and(
            eq(grants.tenant_id, tenant_id),
            eq(grants.user_id, user_id),
            eq(grants.client_id, clientID),
            eq(grants.audience, audience ?? ""),
          ),
        )
        .get();

      if (!row) return null;
      return sqlToGrant(row);
    },

    async list(tenant_id: string, params?: ListParams) {
      const {
        page = 0,
        per_page = 50,
        include_totals = false,
        sort,
        q,
      } = params || {};

      const luceneFilter = q
        ? buildLuceneFilter(grants, q, ["user_id", "client_id", "audience"])
        : undefined;

      const whereCondition = luceneFilter
        ? and(eq(grants.tenant_id, tenant_id), luceneFilter)
        : eq(grants.tenant_id, tenant_id);

      let query = db.select().from(grants).where(whereCondition).$dynamic();

      const col = sort?.sort_by ? getSortableColumn(sort.sort_by) : undefined;
      if (col) {
        query = query.orderBy(
          sort?.sort_order === "desc" ? desc(col) : asc(col),
        );
      } else {
        query = query.orderBy(asc(grants.created_at));
      }

      const results = await query.offset(page * per_page).limit(per_page);
      const mapped = results.map(sqlToGrant);

      if (!include_totals) {
        return { grants: mapped, start: 0, limit: 0, length: 0 };
      }

      const [countResult] = await db
        .select({ count: countFn() })
        .from(grants)
        .where(whereCondition);

      return {
        grants: mapped,
        start: page * per_page,
        limit: per_page,
        length: Number(countResult?.count ?? 0),
      };
    },

    async remove(tenant_id: string, id: string): Promise<boolean> {
      const results = await db
        .delete(grants)
        .where(and(eq(grants.tenant_id, tenant_id), eq(grants.id, id)))
        .returning();

      return results.length > 0;
    },

    async removeByUser(tenant_id: string, user_id: string): Promise<boolean> {
      const results = await db
        .delete(grants)
        .where(
          and(eq(grants.tenant_id, tenant_id), eq(grants.user_id, user_id)),
        )
        .returning();

      return results.length > 0;
    },
  };
}
