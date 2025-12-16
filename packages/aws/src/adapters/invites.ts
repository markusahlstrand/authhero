import { nanoid } from "nanoid";
import {
  InvitesAdapter,
  Invite,
  InviteInsert,
  ListInvitesResponse,
  ListParams,
  inviteSchema,
} from "@authhero/adapter-interfaces";
import { DynamoDBContext, DynamoDBBaseItem } from "../types";
import { inviteKeys } from "../keys";
import {
  getItem,
  putItem,
  deleteItem,
  queryWithPagination,
  updateItem,
  stripDynamoDBFields,
  removeNullProperties,
} from "../utils";

interface InviteItem extends DynamoDBBaseItem {
  id: string;
  tenant_id: string;
  organization_id: string;
  inviter: string; // JSON string
  invitee: string; // JSON string
  client_id: string;
  connection_id?: string;
  invitation_url: string;
  expires_at: string;
  app_metadata?: string; // JSON string
  user_metadata?: string; // JSON string
  roles?: string; // JSON array string
  ticket_id?: string;
  ttl_sec?: number;
  send_invitation_email?: boolean;
}

function toInvite(item: InviteItem): Invite {
  const { tenant_id, ...rest } = stripDynamoDBFields(item);

  const data = removeNullProperties({
    ...rest,
    inviter: item.inviter ? JSON.parse(item.inviter) : {},
    invitee: item.invitee ? JSON.parse(item.invitee) : {},
    app_metadata: item.app_metadata
      ? JSON.parse(item.app_metadata)
      : undefined,
    user_metadata: item.user_metadata
      ? JSON.parse(item.user_metadata)
      : undefined,
    roles: item.roles ? JSON.parse(item.roles) : undefined,
  });

  return inviteSchema.parse(data);
}

export function createInvitesAdapter(ctx: DynamoDBContext): InvitesAdapter {
  return {
    async create(tenantId: string, params: InviteInsert): Promise<Invite> {
      const now = new Date().toISOString();
      const id = nanoid();
      
      // Calculate expires_at from ttl_sec (default 7 days = 604800 seconds)
      const ttlSec = params.ttl_sec || 604800;
      const expiresAt = new Date(Date.now() + ttlSec * 1000).toISOString();

      const item: InviteItem = {
        PK: inviteKeys.pk(tenantId),
        SK: inviteKeys.sk(id),
        GSI1PK: inviteKeys.gsi1pk(tenantId, params.organization_id),
        GSI1SK: inviteKeys.gsi1sk(id),
        entityType: "INVITE",
        tenant_id: tenantId,
        id,
        organization_id: params.organization_id,
        inviter: JSON.stringify(params.inviter || {}),
        invitee: JSON.stringify(params.invitee || {}),
        client_id: params.client_id,
        connection_id: params.connection_id,
        invitation_url: params.invitation_url,
        expires_at: expiresAt,
        app_metadata: params.app_metadata
          ? JSON.stringify(params.app_metadata)
          : undefined,
        user_metadata: params.user_metadata
          ? JSON.stringify(params.user_metadata)
          : undefined,
        roles: params.roles ? JSON.stringify(params.roles) : undefined,
        ttl_sec: ttlSec,
        send_invitation_email: params.send_invitation_email ?? true,
        created_at: now,
        updated_at: now,
      };

      // Set TTL for automatic expiration
      (item as any).ttl = Math.floor(new Date(expiresAt).getTime() / 1000);

      await putItem(ctx, item);

      return toInvite(item);
    },

    async get(tenantId: string, id: string): Promise<Invite | null> {
      const item = await getItem<InviteItem>(
        ctx,
        inviteKeys.pk(tenantId),
        inviteKeys.sk(id),
      );

      if (!item) return null;

      return toInvite(item);
    },

    async list(
      tenantId: string,
      params: ListParams = {},
    ): Promise<ListInvitesResponse> {
      const result = await queryWithPagination<InviteItem>(
        ctx,
        inviteKeys.pk(tenantId),
        params,
        { skPrefix: "INVITE#" },
      );

      return {
        invites: result.items.map(toInvite),
        start: result.start,
        limit: result.limit,
        length: result.length,
      };
    },

    async update(
      tenantId: string,
      id: string,
      params: Partial<InviteInsert>,
    ): Promise<boolean> {
      const updates: Record<string, unknown> = {
        ...params,
        updated_at: new Date().toISOString(),
      };

      if (params.inviter !== undefined) {
        updates.inviter = JSON.stringify(params.inviter);
      }
      if (params.invitee !== undefined) {
        updates.invitee = JSON.stringify(params.invitee);
      }
      if (params.app_metadata !== undefined) {
        updates.app_metadata = JSON.stringify(params.app_metadata);
      }
      if (params.user_metadata !== undefined) {
        updates.user_metadata = JSON.stringify(params.user_metadata);
      }
      if (params.roles !== undefined) {
        updates.roles = JSON.stringify(params.roles);
      }

      // Remove id from updates
      delete updates.id;

      return updateItem(
        ctx,
        inviteKeys.pk(tenantId),
        inviteKeys.sk(id),
        updates,
      );
    },

    async remove(tenantId: string, id: string): Promise<boolean> {
      return deleteItem(ctx, inviteKeys.pk(tenantId), inviteKeys.sk(id));
    },
  };
}
