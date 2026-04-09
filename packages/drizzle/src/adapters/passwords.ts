import { eq, and, desc } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { Password } from "@authhero/adapter-interfaces";
import { passwords } from "../schema/sqlite";
import type { DrizzleDb } from "./types";

function sqlToPassword(row: any): Password {
  const { tenant_id: _, is_current, ...rest } = row;
  return {
    ...rest,
    is_current: !!is_current,
  };
}

export function createPasswordsAdapter(db: DrizzleDb) {
  return {
    async create(tenant_id: string, params: any): Promise<Password> {
      const now = new Date().toISOString();
      const id = params.id || nanoid();

      // Mark all existing passwords as non-current
      if (params.is_current !== false) {
        await db
          .update(passwords)
          .set({ is_current: 0 })
          .where(
            and(
              eq(passwords.tenant_id, tenant_id),
              eq(passwords.user_id, params.user_id),
            ),
          );
      }

      const values = {
        id,
        tenant_id,
        user_id: params.user_id,
        password: params.password,
        algorithm: params.algorithm || "bcrypt",
        is_current: params.is_current !== false ? 1 : 0,
        created_at: now,
        updated_at: now,
      };

      await db.insert(passwords).values(values);

      return sqlToPassword({ ...values, tenant_id });
    },

    async get(tenant_id: string, user_id: string): Promise<Password | null> {
      const result = await db
        .select()
        .from(passwords)
        .where(
          and(
            eq(passwords.tenant_id, tenant_id),
            eq(passwords.user_id, user_id),
            eq(passwords.is_current, 1),
          ),
        )
        .get();

      if (!result) return null;
      return sqlToPassword(result);
    },

    async list(
      tenant_id: string,
      user_id: string,
      limit?: number,
    ): Promise<Password[]> {
      let query = db
        .select()
        .from(passwords)
        .where(
          and(
            eq(passwords.tenant_id, tenant_id),
            eq(passwords.user_id, user_id),
          ),
        )
        .orderBy(desc(passwords.created_at))
        .$dynamic();

      if (limit) {
        query = query.limit(limit);
      }

      const results = await query;
      return results.map(sqlToPassword);
    },

    async update(tenant_id: string, params: any): Promise<boolean> {
      const updateData: any = {
        updated_at: new Date().toISOString(),
      };

      if (params.password !== undefined) updateData.password = params.password;
      if (params.algorithm !== undefined) updateData.algorithm = params.algorithm;
      if (params.is_current !== undefined)
        updateData.is_current = params.is_current ? 1 : 0;

      if (params.id) {
        await db
          .update(passwords)
          .set(updateData)
          .where(
            and(
              eq(passwords.tenant_id, tenant_id),
              eq(passwords.id, params.id),
            ),
          );
      } else {
        await db
          .update(passwords)
          .set(updateData)
          .where(
            and(
              eq(passwords.tenant_id, tenant_id),
              eq(passwords.user_id, params.user_id),
              eq(passwords.is_current, 1),
            ),
          );
      }

      return true;
    },
  };
}
