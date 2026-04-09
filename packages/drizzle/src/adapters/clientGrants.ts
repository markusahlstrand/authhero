import { eq, and, count as countFn, asc, desc } from "drizzle-orm";
import { nanoid } from "nanoid";
import type {
  ClientGrant,
  ClientGrantInsert,
  ListParams,
} from "@authhero/adapter-interfaces";
import { clientGrants } from "../schema/sqlite";
import { removeNullProperties, parseJsonIfString } from "../helpers/transform";
import { buildLuceneFilter } from "../helpers/filter";
import type { DrizzleDb } from "./types";

function sqlToClientGrant(row: any): ClientGrant {
  const { tenant_id: _, scope, authorization_details_types, allow_any_organization, is_system, ...rest } = row;
  return removeNullProperties({
    ...rest,
    scope: parseJsonIfString(scope, []),
    authorization_details_types: parseJsonIfString(
      authorization_details_types,
      [],
    ),
    allow_any_organization: !!allow_any_organization,
    is_system: !!is_system,
  });
}

export function createClientGrantsAdapter(db: DrizzleDb) {
  return {
    async create(tenant_id: string, params: any): Promise<ClientGrant> {
      const now = new Date().toISOString();
      const id = params.id || nanoid();

      const values = {
        id,
        tenant_id,
        client_id: params.client_id,
        audience: params.audience,
        scope: JSON.stringify(params.scope || []),
        organization_usage: params.organization_usage,
        allow_any_organization: params.allow_any_organization ? 1 : 0,
        is_system: params.is_system ? 1 : 0,
        subject_type: params.subject_type,
        authorization_details_types: JSON.stringify(
          params.authorization_details_types || [],
        ),
        created_at: now,
        updated_at: now,
      };

      await db.insert(clientGrants).values(values);

      return sqlToClientGrant({ ...values, tenant_id });
    },

    async get(tenant_id: string, id: string): Promise<ClientGrant | null> {
      const result = await db
        .select()
        .from(clientGrants)
        .where(
          and(
            eq(clientGrants.tenant_id, tenant_id),
            eq(clientGrants.id, id),
          ),
        )
        .get();

      if (!result) return null;
      return sqlToClientGrant(result);
    },

    async update(
      tenant_id: string,
      id: string,
      params: Partial<ClientGrantInsert>,
    ): Promise<boolean> {
      const {
        scope,
        authorization_details_types,
        allow_any_organization,
        is_system,
        ...rest
      } = params;

      const updateData: any = {
        ...rest,
        updated_at: new Date().toISOString(),
      };

      if (scope !== undefined) updateData.scope = JSON.stringify(scope);
      if (authorization_details_types !== undefined)
        updateData.authorization_details_types = JSON.stringify(
          authorization_details_types,
        );
      if (allow_any_organization !== undefined)
        updateData.allow_any_organization = allow_any_organization ? 1 : 0;
      if (is_system !== undefined) updateData.is_system = is_system ? 1 : 0;

      const results = await db
        .update(clientGrants)
        .set(updateData)
        .where(
          and(
            eq(clientGrants.tenant_id, tenant_id),
            eq(clientGrants.id, id),
          ),
        )
        .returning();

      return results.length > 0;
    },

    async list(tenant_id: string, params?: ListParams) {
      const { page = 0, per_page = 50, include_totals = false, sort, q } =
        params || {};

      const luceneFilter = q
        ? buildLuceneFilter(clientGrants, q, ["client_id", "audience"])
        : undefined;

      const whereCondition = luceneFilter
        ? and(eq(clientGrants.tenant_id, tenant_id), luceneFilter)
        : eq(clientGrants.tenant_id, tenant_id);

      let query = db
        .select()
        .from(clientGrants)
        .where(whereCondition)
        .$dynamic();

      if (sort?.sort_by) {
        const col = (clientGrants as any)[sort.sort_by];
        if (col) {
          query = query.orderBy(
            sort.sort_order === "desc" ? desc(col) : asc(col),
          );
        }
      } else {
        query = query.orderBy(asc(clientGrants.created_at));
      }

      const results = await query.offset(page * per_page).limit(per_page);
      const mapped = results.map(sqlToClientGrant);

      if (!include_totals) {
        return { client_grants: mapped };
      }

      const [countResult] = await db
        .select({ count: countFn() })
        .from(clientGrants)
        .where(whereCondition);

      return {
        client_grants: mapped,
        start: page * per_page,
        limit: per_page,
        length: Number(countResult?.count ?? 0),
      };
    },

    async remove(tenant_id: string, id: string): Promise<boolean> {
      const results = await db
        .delete(clientGrants)
        .where(
          and(
            eq(clientGrants.tenant_id, tenant_id),
            eq(clientGrants.id, id),
          ),
        )
        .returning();

      return results.length > 0;
    },
  };
}
