import { Kysely } from "kysely";
import { Database } from "../db";
import { ListParams, ListRoleUsersResponse } from "@authhero/adapter-interfaces";
import { keysetPaginate, isKeysetRequest } from "../helpers/paginate";

export function listUsers(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    role_id: string,
    params?: ListParams,
  ): Promise<ListRoleUsersResponse> => {
    // A user can hold the same role under several organization scopes; the
    // endpoint lists users, so collapse assignments to distinct user_ids.
    // user_roles has no surrogate id, so the (unique-after-distinct) user_id
    // doubles as both sort column and keyset tiebreaker.
    const query = db
      .selectFrom("user_roles")
      .select("user_id")
      .distinct()
      .where("tenant_id", "=", tenant_id)
      .where("role_id", "=", role_id);

    if (isKeysetRequest(params)) {
      const { rows, limit, next } = await keysetPaginate(query, params, {
        sortColumn: "user_id",
        sortOrder: "asc",
        idColumn: "user_id",
      });
      return {
        userIds: rows.map((row) => row.user_id),
        start: 0,
        limit,
        length: rows.length,
        next,
      };
    }

    const page = params?.page || 0;
    const per_page = params?.per_page || 50;
    const offset = page * per_page;

    const results = await query
      .orderBy("user_id", "asc")
      .limit(per_page)
      .offset(offset)
      .execute();

    const total = await db
      .selectFrom("user_roles")
      .select(db.fn.count("user_id").distinct().as("count"))
      .where("tenant_id", "=", tenant_id)
      .where("role_id", "=", role_id)
      .executeTakeFirst();

    return {
      userIds: results.map((row) => row.user_id),
      start: offset,
      limit: per_page,
      length: Number(total?.count || 0),
    };
  };
}
