import { nanoid } from "nanoid";
import {
  LoginSessionsAdapter,
  LoginSession,
  LoginSessionInsert,
  loginSessionSchema,
} from "@authhero/adapter-interfaces";
import { DynamoDBContext, DynamoDBBaseItem } from "../types";
import { loginSessionKeys } from "../keys";
import {
  getItem,
  putItem,
  deleteItem,
  updateItem,
  stripDynamoDBFields,
  removeNullProperties,
} from "../utils";

interface LoginSessionItem extends DynamoDBBaseItem {
  id: string;
  tenant_id: string;
  csrf_token: string;
  authParams: string; // JSON string of AuthParams
  expires_at: string;
  pipeline_state?: string; // JSON string of PipelineState
  auth0Client?: string;
  deleted_at?: string;
  ip?: string;
  useragent?: string;
  session_id?: string;
  authorization_url?: string;
}

function toLoginSession(item: LoginSessionItem): LoginSession {
  const { tenant_id, authParams, pipeline_state, ...rest } =
    stripDynamoDBFields(item);

  const data = removeNullProperties({
    ...rest,
    authParams: JSON.parse(authParams),
    pipeline_state: pipeline_state ? JSON.parse(pipeline_state) : undefined,
  });

  return loginSessionSchema.parse(data);
}

export function createLoginSessionsAdapter(
  ctx: DynamoDBContext,
): LoginSessionsAdapter {
  return {
    async create(
      tenantId: string,
      session: LoginSessionInsert,
    ): Promise<LoginSession> {
      const now = new Date().toISOString();
      const id = nanoid();

      const item: LoginSessionItem = {
        PK: loginSessionKeys.pk(tenantId),
        SK: loginSessionKeys.sk(id),
        entityType: "LOGIN_SESSION",
        tenant_id: tenantId,
        id,
        csrf_token: session.csrf_token,
        authParams: JSON.stringify(session.authParams),
        expires_at: session.expires_at,
        pipeline_state: session.pipeline_state
          ? JSON.stringify(session.pipeline_state)
          : undefined,
        auth0Client: session.auth0Client,
        deleted_at: session.deleted_at,
        ip: session.ip,
        useragent: session.useragent,
        session_id: session.session_id,
        authorization_url: session.authorization_url?.slice(0, 1024),
        created_at: now,
        updated_at: now,
      };

      // Set TTL for automatic expiration
      (item as any).ttl = Math.floor(
        new Date(session.expires_at).getTime() / 1000,
      );

      await putItem(ctx, item);

      return toLoginSession(item);
    },

    async get(tenantId: string, id: string): Promise<LoginSession | null> {
      const item = await getItem<LoginSessionItem>(
        ctx,
        loginSessionKeys.pk(tenantId),
        loginSessionKeys.sk(id),
      );

      if (!item) return null;

      return toLoginSession(item);
    },

    async update(
      tenantId: string,
      id: string,
      session: Partial<LoginSession>,
    ): Promise<boolean> {
      const updates: Record<string, unknown> = {
        ...session,
        updated_at: new Date().toISOString(),
      };

      // Serialize authParams if present
      if (session.authParams !== undefined) {
        updates.authParams = JSON.stringify(session.authParams);
      }

      // Serialize pipeline_state if present
      if (session.pipeline_state !== undefined) {
        updates.pipeline_state = JSON.stringify(session.pipeline_state);
      }

      // Remove id from updates
      delete updates.id;

      return updateItem(
        ctx,
        loginSessionKeys.pk(tenantId),
        loginSessionKeys.sk(id),
        updates,
      );
    },

    async remove(tenantId: string, id: string): Promise<boolean> {
      return deleteItem(
        ctx,
        loginSessionKeys.pk(tenantId),
        loginSessionKeys.sk(id),
      );
    },
  };
}
