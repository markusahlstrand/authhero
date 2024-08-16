import { Application } from "@authhero/adapter-interfaces";
import { Kysely } from "kysely";
import { Database } from "../db";

export function list(db: Kysely<Database>) {
  return async (tenantId: string) => {
    let query = db
      .selectFrom("applications")
      .where("applications.tenant_id", "=", tenantId);

    const results = await query.selectAll().execute();
    const applications: Application[] = results.map((result) => ({
      ...result,
      disable_sign_ups: !!result.disable_sign_ups,
      addons: result.addons ? JSON.parse(result.addons) : {},
    }));

    return {
      applications,
    };
  };
}
