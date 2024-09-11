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
      callbacks: result.callbacks ? JSON.parse(result.callbacks) : [],
      allowed_origins: result.allowed_origins
        ? JSON.parse(result.allowed_origins)
        : [],
      web_origins: result.web_origins ? JSON.parse(result.web_origins) : [],
      allowed_logout_urls: result.allowed_logout_urls
        ? JSON.parse(result.allowed_logout_urls)
        : [],
      allowed_clients: result.allowed_logout_urls
        ? JSON.parse(result.allowed_logout_urls)
        : [],
    }));

    return {
      applications,
    };
  };
}
