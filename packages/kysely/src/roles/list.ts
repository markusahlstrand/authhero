import { Kysely } from "kysely";
import { Database, sqlRoleSchema } from "../db";
import {
  ListParams,
  ListRolesResponse,
  Role,
} from "@authhero/adapter-interfaces";
import getCountAsInt from "../utils/getCountAsInt";
import { luceneFilter } from "../helpers/filter";
import { z } from "@hono/zod-openapi";

type RoleDbRow = z.infer<typeof sqlRoleSchema>;

export function list(db: Kysely<Database>) {
  return async (
    tenantId: string,
    params: ListParams,
  ): Promise<ListRolesResponse> => {
    let query = db.selectFrom("roles").where("roles.tenant_id", "=", tenantId);

    const { page = 0, per_page = 50, include_totals = false } = params;

    if (params.q) {
      query = luceneFilter(db, query, params.q, ["name"]);
    }

    const filteredQuery = query.offset(page * per_page).limit(per_page);

    const rows = await filteredQuery.selectAll().execute();

    const roles: Role[] = rows.map((row) => {
      const dbRow = row as RoleDbRow;
      const { is_system, tenant_id, ...rest } = dbRow;
      return {
        ...rest,
        is_system: is_system ? true : undefined,
      };
    });

    if (!include_totals) {
      return {
        roles,
        start: page * per_page,
        limit: per_page,
        length: roles.length,
      };
    }

    const { count } = await query
      .select((eb) => eb.fn.countAll().as("count"))
      .executeTakeFirstOrThrow();

    return {
      roles,
      start: page * per_page,
      limit: per_page,
      length: getCountAsInt(count),
    };
  };
}
