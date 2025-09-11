import { Kysely } from "kysely";
import { Database } from "../db";
import { Role, ListParams } from "@authhero/adapter-interfaces";

export function list(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    user_id: string,
    _params?: ListParams,
    organization_id?: string,
  ): Promise<Role[]> => {
    let query = db
      .selectFrom("user_roles as ur")
      .innerJoin("roles as r", (join) =>
        join
          .onRef("ur.role_id", "=", "r.id")
          .onRef("ur.tenant_id", "=", "r.tenant_id"),
      )
      .select([
        "r.id",
        "r.name",
        "r.description",
        "r.created_at",
        "r.updated_at",
      ])
      .where("ur.tenant_id", "=", tenant_id)
      .where("ur.user_id", "=", user_id);

    // Add organization filter if provided
    if (organization_id !== undefined) {
      query = query.where("ur.organization_id", "=", organization_id);
    }

    const rows = await query.execute();

    return rows as unknown as Role[];
  };
}
