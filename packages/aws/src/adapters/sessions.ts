import {
  SessionsAdapter,
  Session,
  SessionInsert,
  ListSesssionsResponse,
  ListParams,
  sessionSchema,
} from "@authhero/adapter-interfaces";
import { DynamoDBContext, DynamoDBBaseItem } from "../types";
import { sessionKeys } from "../keys";
import {
  getItem,
  putItem,
  deleteItem,
  queryWithPagination,
  updateItem,
  stripDynamoDBFields,
  removeNullProperties,
} from "../utils";

interface SessionItem extends DynamoDBBaseItem {
  id: string;
  tenant_id: string;
  user_id: string;
  login_session_id: string;
  revoked_at?: string;
  used_at?: string;
  expires_at?: string;
  idle_expires_at?: string;
  authenticated_at: string;
  last_interaction_at: string;
  device: string; // JSON string
  clients: string; // JSON array string
}

function toSession(item: SessionItem): Session {
  const { tenant_id, ...rest } = stripDynamoDBFields(item);

  const data = removeNullProperties({
    ...rest,
    device: JSON.parse(item.device || "{}"),
    clients: JSON.parse(item.clients || "[]"),
  });

  return sessionSchema.parse(data);
}

export function createSessionsAdapter(ctx: DynamoDBContext): SessionsAdapter {
  return {
    async create(tenantId: string, session: SessionInsert): Promise<Session> {
      const now = new Date().toISOString();

      const item: SessionItem = {
        PK: sessionKeys.pk(tenantId),
        SK: sessionKeys.sk(session.id),
        GSI1PK: sessionKeys.gsi1pk(tenantId, session.user_id),
        GSI1SK: sessionKeys.gsi1sk(session.id),
        entityType: "SESSION",
        tenant_id: tenantId,
        id: session.id,
        user_id: session.user_id,
        login_session_id: session.login_session_id,
        revoked_at: session.revoked_at,
        used_at: session.used_at,
        expires_at: session.expires_at,
        idle_expires_at: session.idle_expires_at,
        authenticated_at: now,
        last_interaction_at: now,
        device: JSON.stringify(session.device || {}),
        clients: JSON.stringify(session.clients || []),
        created_at: now,
        updated_at: now,
      };

      // Set TTL if expires_at is set
      if (session.expires_at) {
        (item as any).ttl = Math.floor(
          new Date(session.expires_at).getTime() / 1000,
        );
      }

      await putItem(ctx, item);

      return toSession(item);
    },

    async get(tenantId: string, sessionId: string): Promise<Session | null> {
      const item = await getItem<SessionItem>(
        ctx,
        sessionKeys.pk(tenantId),
        sessionKeys.sk(sessionId),
      );

      if (!item) return null;

      return toSession(item);
    },

    async list(
      tenantId: string,
      params: ListParams = {},
    ): Promise<ListSesssionsResponse> {
      const result = await queryWithPagination<SessionItem>(
        ctx,
        sessionKeys.pk(tenantId),
        params,
        { skPrefix: "SESSION#" },
      );

      return {
        sessions: result.items.map(toSession),
        start: result.start,
        limit: result.limit,
        length: result.length,
      };
    },

    async update(
      tenantId: string,
      sessionId: string,
      session: Partial<Session>,
    ): Promise<boolean> {
      const updates: Record<string, unknown> = {
        ...session,
        updated_at: new Date().toISOString(),
      };

      // Handle complex fields
      if (session.device !== undefined) {
        updates.device = JSON.stringify(session.device);
      }
      if (session.clients !== undefined) {
        updates.clients = JSON.stringify(session.clients);
      }

      // Update TTL if expires_at is updated
      if (session.expires_at) {
        updates.ttl = Math.floor(new Date(session.expires_at).getTime() / 1000);
      }

      // Remove fields that shouldn't be updated
      delete updates.id;

      return updateItem(
        ctx,
        sessionKeys.pk(tenantId),
        sessionKeys.sk(sessionId),
        updates,
      );
    },

    async remove(tenantId: string, sessionId: string): Promise<boolean> {
      return deleteItem(
        ctx,
        sessionKeys.pk(tenantId),
        sessionKeys.sk(sessionId),
      );
    },
  };
}
