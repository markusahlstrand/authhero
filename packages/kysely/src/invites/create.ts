import { Kysely } from "kysely";
import { HTTPException } from "hono/http-exception";
import { Database } from "../db";
import { Invite, InviteInsert } from "@authhero/adapter-interfaces";
import { generateInviteId } from "../utils/entity-id";

export function create(db: Kysely<Database>) {
  return async (tenantId: string, invite: InviteInsert): Promise<Invite> => {
    const inviteId = generateInviteId();
    const createdAt = new Date().toISOString();

    // Calculate expires_at based on ttl_sec (default 7 days)
    const ttlSec = invite.ttl_sec || 604800;
    const expiresAt = new Date(Date.now() + ttlSec * 1000).toISOString();

    // Generate invitation URL (this would typically include the tenant domain and invite ID)
    // For now, we'll use a placeholder - this should be customized based on your application's URL structure
    const invitationUrl = `https://invite.placeholder/${inviteId}`;

    const sqlInvite = {
      id: inviteId,
      tenant_id: tenantId,
      organization_id: invite.organization_id || "",
      inviter: JSON.stringify(invite.inviter || {}),
      invitee: JSON.stringify(invite.invitee || {}),
      client_id: invite.client_id,
      connection_id: invite.connection_id || null,
      invitation_url: invitationUrl,
      created_at: createdAt,
      expires_at: expiresAt,
      app_metadata: JSON.stringify(invite.app_metadata || {}),
      user_metadata: JSON.stringify(invite.user_metadata || {}),
      roles: JSON.stringify(invite.roles || []),
      ticket_id: null,
      ttl_sec: ttlSec,
      send_invitation_email: (invite.send_invitation_email ?? true) ? 1 : 0,
    };

    try {
      await db.insertInto("invites").values(sqlInvite).execute();
    } catch (err: any) {
      if (
        err.code === "SQLITE_CONSTRAINT_UNIQUE" ||
        err.message.includes("AlreadyExists")
      ) {
        throw new HTTPException(409, {
          message: "Invite already exists",
        });
      }
      throw err;
    }

    return {
      id: inviteId,
      organization_id: sqlInvite.organization_id,
      inviter: invite.inviter,
      invitee: invite.invitee,
      client_id: invite.client_id,
      connection_id: invite.connection_id,
      invitation_url: invitationUrl,
      created_at: createdAt,
      expires_at: expiresAt,
      app_metadata: invite.app_metadata || {},
      user_metadata: invite.user_metadata || {},
      roles: invite.roles || [],
      ticket_id: sqlInvite.ticket_id || undefined,
      ttl_sec: ttlSec,
      send_invitation_email: invite.send_invitation_email ?? true,
    };
  };
}
