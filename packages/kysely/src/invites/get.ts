import { Kysely } from "kysely";
import { Database } from "../db";
import { Invite } from "@authhero/adapter-interfaces";
import { removeNullProperties } from "../helpers/remove-nulls";
import { parseJsonProperties } from "../helpers/parse";

export function get(db: Kysely<Database>) {
  return async (tenantId: string, id: string): Promise<Invite | null> => {
    const result = await db
      .selectFrom("invites")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("id", "=", id)
      .executeTakeFirst();

    if (!result) {
      return null;
    }

    const parsed = parseJsonProperties(result, {
      inviter: {},
      invitee: {},
      app_metadata: {},
      user_metadata: {},
      roles: [],
    });

    return removeNullProperties({
      ...parsed,
      send_invitation_email: result.send_invitation_email === 1,
    });
  };
}
