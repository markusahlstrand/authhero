import { Kysely } from "kysely";
import { Database } from "../db";
import { InviteInsert } from "@authhero/adapter-interfaces";

export function update(db: Kysely<Database>) {
  return async (
    tenantId: string,
    id: string,
    invite: Partial<InviteInsert>,
  ): Promise<boolean> => {
    const updateData: Record<string, any> = {};

    if (invite.inviter !== undefined) {
      updateData.inviter = JSON.stringify(invite.inviter);
    }
    if (invite.invitee !== undefined) {
      updateData.invitee = JSON.stringify(invite.invitee);
    }
    if (invite.client_id !== undefined) {
      updateData.client_id = invite.client_id;
    }
    if (invite.connection_id !== undefined) {
      updateData.connection_id = invite.connection_id;
    }
    if (invite.app_metadata !== undefined) {
      updateData.app_metadata = JSON.stringify(invite.app_metadata);
    }
    if (invite.user_metadata !== undefined) {
      updateData.user_metadata = JSON.stringify(invite.user_metadata);
    }
    if (invite.roles !== undefined) {
      updateData.roles = JSON.stringify(invite.roles);
    }
    if (invite.ttl_sec !== undefined) {
      updateData.ttl_sec = invite.ttl_sec;
      // Recalculate expires_at if ttl_sec is updated
      updateData.expires_at = new Date(
        Date.now() + invite.ttl_sec * 1000,
      ).toISOString();
    }
    if (invite.send_invitation_email !== undefined) {
      updateData.send_invitation_email = invite.send_invitation_email ? 1 : 0;
    }

    if (Object.keys(updateData).length === 0) {
      return true;
    }

    const result = await db
      .updateTable("invites")
      .set(updateData)
      .where("tenant_id", "=", tenantId)
      .where("id", "=", id)
      .executeTakeFirst();

    return result.numUpdatedRows > 0n;
  };
}
