import { Kysely } from "kysely";
import { removeNullProperties } from "../helpers/remove-nulls";
import { Application } from "@authhero/adapter-interfaces";
import { Database } from "../db";

export function get(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    application_id: string,
  ): Promise<Application | null> => {
    const application = await db
      .selectFrom("applications")
      .where("applications.tenant_id", "=", tenant_id)
      .where("applications.id", "=", application_id)
      .selectAll()
      .executeTakeFirst();

    if (!application) {
      return null;
    }

    return removeNullProperties({
      ...application,
      disable_sign_ups: !!application.disable_sign_ups,
      addons: JSON.parse(application.addons),
      // TODO: add callbacks
      callback: JSON.parse(application.callbacks),
      allowed_origins: JSON.parse(application.allowed_origins),
      allowed_callback_urls: JSON.parse(application.allowed_callback_urls),
      allowed_web_origins: JSON.parse(application.allowed_web_origins),
    });
  };
}
