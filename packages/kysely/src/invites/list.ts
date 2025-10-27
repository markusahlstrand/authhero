import { Kysely } from "kysely";
import { Database } from "../db";
import { ListInvitesResponse, ListParams } from "@authhero/adapter-interfaces";
import { removeNullProperties } from "../helpers/remove-nulls";

export function list(db: Kysely<Database>) {
  return async (
    tenantId: string,
    params?: ListParams,
  ): Promise<ListInvitesResponse> => {
    let query = db
      .selectFrom("invites")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .orderBy("created_at", "desc");

    if (params?.per_page) {
      query = query.limit(params.per_page);
    }

    if (params?.page) {
      const offset = (params.page - 1) * (params.per_page || 10);
      query = query.offset(offset);
    }

    const results = await query.execute();

    const invites = results.map((result) =>
      removeNullProperties({
        ...result,
        inviter: result.inviter ? JSON.parse(result.inviter) : {},
        invitee: result.invitee ? JSON.parse(result.invitee) : {},
        app_metadata: result.app_metadata
          ? JSON.parse(result.app_metadata)
          : {},
        user_metadata: result.user_metadata
          ? JSON.parse(result.user_metadata)
          : {},
        roles: result.roles ? JSON.parse(result.roles) : [],
        send_invitation_email: result.send_invitation_email === 1,
      }),
    );

    return {
      invites,
      start: params?.page ? (params.page - 1) * (params.per_page || 10) : 0,
      limit: params?.per_page || invites.length,
      length: invites.length,
    };
  };
}
