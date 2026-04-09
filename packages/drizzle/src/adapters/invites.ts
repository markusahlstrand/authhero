import { eq, and, count as countFn, asc, desc } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import type { Invite, ListParams } from "@authhero/adapter-interfaces";
import { invites } from "../schema/sqlite";
import { removeNullProperties, parseJsonIfString } from "../helpers/transform";
import type { DrizzleDb } from "./types";

function generateInviteId(): string {
  const { customAlphabet } = require("nanoid");
  const generate = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 17);
  return `inv_${generate()}`;
}

const JSON_FIELDS = [
  "inviter",
  "invitee",
  "app_metadata",
  "user_metadata",
  "roles",
] as const;

function sqlToInvite(row: any): Invite {
  const { tenant_id: _, send_invitation_email, ...rest } = row;
  const result: any = { ...rest };

  for (const field of JSON_FIELDS) {
    result[field] = parseJsonIfString(rest[field], field === "roles" ? [] : {});
  }

  result.send_invitation_email = !!send_invitation_email;

  return removeNullProperties(result);
}

export function createInvitesAdapter(db: DrizzleDb) {
  return {
    async create(tenantId: string, params: any): Promise<Invite> {
      const id = params.id || generateInviteId();
      const ttl_sec = params.ttl_sec || 604800; // 7 days default
      const now = new Date();
      const expires_at = new Date(
        now.getTime() + ttl_sec * 1000,
      ).toISOString();

      const values: any = {
        id,
        tenant_id: tenantId,
        organization_id: params.organization_id,
        client_id: params.client_id,
        connection_id: params.connection_id,
        invitation_url: params.invitation_url,
        ticket_id: params.ticket_id,
        ttl_sec,
        send_invitation_email:
          params.send_invitation_email !== false ? 1 : 0,
        created_at: now.toISOString(),
        expires_at,
      };

      for (const field of JSON_FIELDS) {
        if (params[field] !== undefined) {
          values[field] = JSON.stringify(params[field]);
        }
      }

      try {
        await db.insert(invites).values(values);
      } catch (error: any) {
        if (
          error?.message?.includes("UNIQUE constraint failed") ||
          error?.message?.includes("duplicate key")
        ) {
          throw new HTTPException(409, { message: "Invite already exists" });
        }
        throw error;
      }

      return sqlToInvite({ ...values, tenant_id: tenantId });
    },

    async get(tenantId: string, id: string): Promise<Invite | null> {
      const result = await db
        .select()
        .from(invites)
        .where(and(eq(invites.tenant_id, tenantId), eq(invites.id, id)))
        .get();

      if (!result) return null;
      return sqlToInvite(result);
    },

    async update(
      tenantId: string,
      id: string,
      params: Partial<Invite>,
    ): Promise<boolean> {
      const updateData: any = {};

      for (const field of JSON_FIELDS) {
        if ((params as any)[field] !== undefined) {
          updateData[field] = JSON.stringify((params as any)[field]);
        }
      }

      if (params.connection_id !== undefined)
        updateData.connection_id = params.connection_id;
      if (params.ttl_sec !== undefined) {
        updateData.ttl_sec = params.ttl_sec;
        updateData.expires_at = new Date(
          Date.now() + params.ttl_sec * 1000,
        ).toISOString();
      }

      const results = await db
        .update(invites)
        .set(updateData)
        .where(and(eq(invites.tenant_id, tenantId), eq(invites.id, id)))
        .returning();

      return results.length > 0;
    },

    async list(tenantId: string, params?: ListParams) {
      const { page = 0, per_page = 50, include_totals = false, sort } =
        params || {};

      let query = db
        .select()
        .from(invites)
        .where(eq(invites.tenant_id, tenantId))
        .$dynamic();

      if (sort?.sort_by) {
        const col = (invites as any)[sort.sort_by];
        if (col) {
          query = query.orderBy(
            sort.sort_order === "desc" ? desc(col) : asc(col),
          );
        }
      }

      const results = await query.offset(page * per_page).limit(per_page);
      const mapped = results.map(sqlToInvite);

      if (!include_totals) {
        return { invites: mapped };
      }

      const [countResult] = await db
        .select({ count: countFn() })
        .from(invites)
        .where(eq(invites.tenant_id, tenantId));

      return {
        invites: mapped,
        start: page * per_page,
        limit: per_page,
        length: Number(countResult?.count ?? 0),
      };
    },

    async remove(tenantId: string, id: string): Promise<boolean> {
      const results = await db
        .delete(invites)
        .where(and(eq(invites.tenant_id, tenantId), eq(invites.id, id)))
        .returning();

      return results.length > 0;
    },
  };
}
