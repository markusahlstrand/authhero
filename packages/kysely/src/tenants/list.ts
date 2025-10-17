import { Kysely } from "kysely";
import { Database } from "../db";
import { ListParams } from "@authhero/adapter-interfaces";
import getCountAsInt from "../utils/getCountAsInt";
import { sqlTenantToTenant } from "./utils";

export function list(db: Kysely<Database>) {
  return async (params: ListParams) => {
    let query = db.selectFrom("tenants");

    const { page = 0, per_page = 50, include_totals = false, sort, q } = params;

    if (sort && sort.sort_by) {
      const { ref } = db.dynamic;
      query = query.orderBy(ref(sort.sort_by), sort.sort_order);
    }

    if (q) {
      query = query.where((eb) =>
        eb.or([eb("friendly_name", "like", `%${q}%`)]),
      );
    }

    const filteredQuery = query.offset(page * per_page).limit(per_page);

    const tenants = await filteredQuery.selectAll().execute();

    const mappedTenants = tenants.map(sqlTenantToTenant);

    if (!include_totals) {
      return {
        tenants: mappedTenants,
      };
    }

    const { count } = await query
      .select((eb) => eb.fn.countAll().as("count"))
      .executeTakeFirstOrThrow();

    const countInt = getCountAsInt(count);

    return {
      tenants: mappedTenants,
      start: page * per_page,
      limit: per_page,
      length: countInt,
    };
  };
}
