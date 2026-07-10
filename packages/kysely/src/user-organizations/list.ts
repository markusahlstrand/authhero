import { Kysely } from "kysely";
import { Database } from "../db";
import {
  UserOrganization,
  Totals,
  ListParams,
} from "@authhero/adapter-interfaces";

export function list(db: Kysely<Database>) {
  return async (
    tenantId: string,
    params?: ListParams,
  ): Promise<{ userOrganizations: UserOrganization[] } & Totals> => {
    // Clamp pagination inputs so negative or non-finite values cannot
    // produce bad SQL. take wins over per_page when both are supplied, and
    // from (checkpoint offset) wins over page. This mirrors the organizations
    // adapter so the Auth0 SDK's from/take pagination is honored.
    const rawPerPage = params?.take ?? params?.per_page;
    const normalized =
      typeof rawPerPage === "number" && Number.isFinite(rawPerPage)
        ? Math.floor(rawPerPage)
        : NaN;
    const per_page = normalized >= 1 ? normalized : 50;

    let offset = 0;
    if (params?.from !== undefined) {
      const parsed = parseInt(params.from, 10);
      if (!Number.isNaN(parsed)) {
        offset = Math.max(0, parsed);
      }
    } else if (typeof params?.page === "number" && Number.isFinite(params.page)) {
      offset = Math.max(0, Math.floor(params.page) * per_page);
    }

    let query = db
      .selectFrom("user_organizations")
      .selectAll()
      .where("tenant_id", "=", tenantId);

    // Support filtering by user_id or organization_id using the q parameter
    if (params?.q) {
      // Check if the query is for a specific user or organization
      if (params.q.startsWith("user_id:")) {
        const userId = params.q.replace("user_id:", "");
        query = query.where("user_id", "=", userId);
      } else if (params.q.startsWith("organization_id:")) {
        const organizationId = params.q.replace("organization_id:", "");
        query = query.where("organization_id", "=", organizationId);
      }
    }

    query = query.orderBy("created_at", "desc");

    if (per_page > 0) {
      query = query.limit(per_page).offset(offset);
    }

    const results = await query.execute();

    // Get total count with the same filters
    let countQuery = db
      .selectFrom("user_organizations")
      .select(db.fn.count("id").as("count"))
      .where("tenant_id", "=", tenantId);

    if (params?.q) {
      if (params.q.startsWith("user_id:")) {
        const userId = params.q.replace("user_id:", "");
        countQuery = countQuery.where("user_id", "=", userId);
      } else if (params.q.startsWith("organization_id:")) {
        const organizationId = params.q.replace("organization_id:", "");
        countQuery = countQuery.where("organization_id", "=", organizationId);
      }
    }

    const total = await countQuery.executeTakeFirst();

    const userOrganizations: UserOrganization[] = results.map((result) => ({
      id: result.id,
      user_id: result.user_id,
      organization_id: result.organization_id,
      created_at: result.created_at,
      updated_at: result.updated_at,
    }));

    return {
      userOrganizations,
      start: offset,
      limit: per_page,
      length: Number(total?.count || 0),
    };
  };
}
