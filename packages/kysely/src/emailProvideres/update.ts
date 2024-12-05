import { EmailProvider } from "@authhero/adapter-interfaces";
import { Kysely } from "kysely";
import { Database } from "../db";

export function update(db: Kysely<Database>) {
  return async (tenant_id: string, emailProvider: Partial<EmailProvider>) => {
    const { credentials, settings, enabled, ...rest } = emailProvider;

    await db
      .updateTable("email_providers")
      .set({
        ...rest,
        credentials: credentials ? JSON.stringify(credentials) : undefined,
        settings: settings ? JSON.stringify(settings) : undefined,
        enabled: enabled !== undefined ? (enabled ? 1 : 0) : undefined,
      })
      .where("tenant_id", "=", tenant_id)
      .execute();
  };
}
