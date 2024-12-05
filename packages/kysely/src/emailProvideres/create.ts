import { EmailProvider } from "@authhero/adapter-interfaces";
import { Kysely } from "kysely";
import { Database } from "../db";

export function create(db: Kysely<Database>) {
  return async (tenant_id: string, emailProvider: EmailProvider) => {
    const { credentials, settings, enabled, ...rest } = emailProvider;

    await db
      .insertInto("email_providers")
      .values({
        ...rest,
        enabled: enabled ? 1 : 0,
        credentials: JSON.stringify(credentials),
        settings: JSON.stringify(settings),
        tenant_id: tenant_id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .execute();
  };
}
