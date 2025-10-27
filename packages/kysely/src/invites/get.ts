import { Kysely } from "kysely";
import { Database } from "../db";
import { Invite } from "@authhero/adapter-interfaces";
import { removeNullProperties } from "../helpers/remove-nulls";

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

    return removeNullProperties({
      ...result,
      inviter: result.inviter ? JSON.parse(result.inviter) : {},
      invitee: result.invitee ? JSON.parse(result.invitee) : {},
      app_metadata: result.app_metadata ? JSON.parse(result.app_metadata) : {},
      user_metadata: result.user_metadata
        ? JSON.parse(result.user_metadata)
        : {},
      roles: result.roles ? JSON.parse(result.roles) : [],
      send_invitation_email: result.send_invitation_email === 1,
    });
  };
}
