import { Kysely } from "kysely";
import { ApplicationInsert } from "@authhero/adapter-interfaces";
import { Database } from "../db";

export function update(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    application_id: string,
    application: Partial<ApplicationInsert>,
  ): Promise<boolean> => {
    const sqlApplication = {
      ...application,
      updated_at: new Date().toISOString(),
      allowed_origins: application.allowed_origins
        ? JSON.stringify(application.allowed_origins)
        : undefined,
      allowed_callback_urls: application.allowed_callback_urls
        ? JSON.stringify(application.allowed_callback_urls)
        : undefined,
      allowed_web_origins: application.allowed_web_origins
        ? JSON.stringify(application.allowed_web_origins)
        : undefined,
      callbacks: application.callbacks
        ? JSON.stringify(application.callbacks)
        : undefined,
      addons: application.addons ? JSON.stringify(application.addons) : "{}",
      disable_sign_ups: application.disable_sign_ups ? 1 : 0,
    };

    await db
      .updateTable("applications")
      .set(sqlApplication)
      .where("applications.id", "=", application_id)
      .where("applications.tenant_id", "=", tenant_id)
      .execute();

    return true;
  };
}
