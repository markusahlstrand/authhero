import { Kysely } from "kysely";
import { Database, sqlPermissionSchema } from "../db";
import {
  ListParams,
  ListPermissionsResponse,
  Permission,
} from "@authhero/adapter-interfaces";
import getCountAsInt from "../utils/getCountAsInt";
import { luceneFilter } from "../helpers/filter";
import { z } from "@hono/zod-openapi";

type PermissionDbRow = z.infer<typeof sqlPermissionSchema>;

export function list(db: Kysely<Database>) {
  return async (
    tenantId: string,
    params: ListParams = { page: 0, per_page: 50, include_totals: false },
  ): Promise<ListPermissionsResponse> => {
    let query = db
      .selectFrom("permissions")
      .where("permissions.tenant_id", "=", tenantId);

    if (params.q) {
      query = luceneFilter(db, query, params.q, [
        "permission_name",
        "resource_server_identifier",
        "resource_server_name",
      ]);
    }

    const filteredQuery = query
      .offset(params.page * params.per_page)
      .limit(params.per_page);

    const rows = await filteredQuery.selectAll().execute();
    const permissions: Permission[] = rows.map((row) => {
      const dbRow = row as PermissionDbRow;
      const { sources, ...rest } = dbRow;

      return {
        ...rest,
        sources: sources ? JSON.parse(sources) : [],
      };
    });

    const { count } = await query
      .select((eb) => eb.fn.countAll().as("count"))
      .executeTakeFirstOrThrow();

    return {
      permissions,
      start: params.page * params.per_page,
      limit: params.per_page,
      length: getCountAsInt(count),
    };
  };
}
