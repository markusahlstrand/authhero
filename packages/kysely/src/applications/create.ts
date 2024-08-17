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
      // TODO: remove fallbacks
      allowed_web_origins: params.allowed_origins,
      allowed_callback_urls: params.callbacks,
      allowed_origins: params.allowed_origins,
    };

    const allowed_origins = JSON.stringify(params.allowed_origins.split(","));
    const allowed_callback_urls = JSON.stringify(params.callbacks.split(","));
    const callbacks = JSON.stringify(params.callbacks.split(","));

    await db
      .insertInto("applications")
      .values({
        ...application,
        tenant_id,
        disable_sign_ups: params.disable_sign_ups ? 1 : 0,
        addons: params.addons ? JSON.stringify(params.addons) : "{}",
        callbacks,
        allowed_web_origins: allowed_origins,
        allowed_callback_urls,
        allowed_origins,
      })
      .execute();

    return application;
  };
}
