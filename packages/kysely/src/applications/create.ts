import { Kysely } from "kysely";
import { Application, ApplicationInsert } from "@authhero/adapter-interfaces";
import { Database } from "../db";

export function create(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    params: ApplicationInsert,
  ): Promise<Application> => {
    const application: Application = {
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...params,
    };

    const allowed_origins = JSON.stringify(params.allowed_origins);
    const callbacks = JSON.stringify(params.callbacks);
    const web_origins = JSON.stringify(params.web_origins);
    const allowed_logout_urls = JSON.stringify(params.allowed_logout_urls);

    await db
      .insertInto("applications")
      .values({
        ...application,
        tenant_id,
        disable_sign_ups: params.disable_sign_ups ? 1 : 0,
        addons: params.addons ? JSON.stringify(params.addons) : "{}",
        callbacks,
        allowed_origins,
        web_origins,
        allowed_logout_urls,
      })
      .execute();

    return application;
  };
}
