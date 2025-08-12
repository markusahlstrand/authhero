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
    params: ListParams = { page: 0, per_page: 50, include_totals: false },
  ): Promise<ListRolesResponse> => {
    let query = db.selectFrom("roles").where("roles.tenant_id", "=", tenantId);

    if (params.q) {
      query = luceneFilter(db, query, params.q, ["name"]);
    }

    const filteredQuery = query
      .offset(params.page * params.per_page)
      .limit(params.per_page);

    const rows = await filteredQuery.selectAll().execute();
    const roles: Role[] = rows.map((row) => {
      return row as RoleDbRow;
    });

    const { count } = await query
      .select((eb) => eb.fn.countAll().as("count"))
      .executeTakeFirstOrThrow();

    return {
      roles,
      start: params.page * params.per_page,
      limit: params.per_page,
      length: getCountAsInt(count),
    };
  };
}
