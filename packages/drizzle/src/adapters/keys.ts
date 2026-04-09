import { eq, or, isNull, gt, count as countFn, asc, desc } from "drizzle-orm";
import type { SigningKey, ListParams } from "@authhero/adapter-interfaces";
import { keys } from "../schema/sqlite";
import { removeNullProperties, getCountAsInt } from "../helpers/transform";
import type { DrizzleDb } from "./types";

export function createKeysAdapter(db: DrizzleDb) {
  return {
    async create(key: SigningKey): Promise<void> {
      await db.insert(keys).values({
        ...key,
        created_at: new Date().toDateString(),
      });
    },

    async list(params?: ListParams) {
      const { page = 0, per_page = 50, include_totals = false, sort } =
        params || {};

      const now = new Date().toISOString();

      let query = db
        .select()
        .from(keys)
        .where(or(gt(keys.revoked_at, now), isNull(keys.revoked_at)))
        .$dynamic();

      if (sort?.sort_by) {
        const col = (keys as any)[sort.sort_by];
        if (col) {
          query = query.orderBy(
            sort.sort_order === "desc" ? desc(col) : asc(col),
          );
        }
      }

      const results = await query.offset(page * per_page).limit(per_page);

      const signingKeys = results.map((row) => {
        const { created_at: _, ...rest } = row;
        return removeNullProperties(rest) as SigningKey;
      });

      if (!include_totals) {
        return { signingKeys };
      }

      const [countResult] = await db
        .select({ count: countFn() })
        .from(keys)
        .where(or(gt(keys.revoked_at, now), isNull(keys.revoked_at)));

      return {
        signingKeys,
        start: page * per_page,
        limit: per_page,
        length: getCountAsInt(countResult?.count ?? 0),
      };
    },

    async update(kid: string, signingKey: Partial<SigningKey>): Promise<boolean> {
      const results = await db
        .update(keys)
        .set(signingKey as any)
        .where(eq(keys.kid, kid))
        .returning();

      return results.length > 0;
    },
  };
}
