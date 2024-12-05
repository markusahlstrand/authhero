import { Kysely } from "kysely";
import { removeNullProperties } from "../helpers/remove-nulls";
import { EmailProvider } from "@authhero/adapter-interfaces";
import { Database } from "../db";

export function get(db: Kysely<Database>) {
  return async (tenant_id: string): Promise<EmailProvider | null> => {
    const [emailProvider] = await db
      .selectFrom("email_providers")
      .where("email_providers.tenant_id", "=", tenant_id)
      .selectAll()
      .execute();

    if (!emailProvider) {
      return null;
    }

    const {
      tenant_id: _,
      credentials,
      settings,
      enabled,
      ...rest
    } = emailProvider;

    return removeNullProperties({
      ...rest,
      credentials: JSON.parse(credentials),
      settings: JSON.parse(settings),
      enabled: Boolean(enabled),
    });
  };
}
