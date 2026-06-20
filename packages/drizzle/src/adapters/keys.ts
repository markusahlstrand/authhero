import {
  eq,
  or,
  and,
  isNull,
  gt,
  count as countFn,
  asc,
  desc,
} from "drizzle-orm";
import type { SigningKey, ListParams } from "@authhero/adapter-interfaces";
import { keys } from "../schema/sqlite";
import { removeNullProperties, getCountAsInt } from "../helpers/transform";
import { buildLuceneFilter, sanitizeLuceneQuery } from "../helpers/filter";
import type { DrizzleDb } from "./types";

// Fields keys.list() accepts in `q`. Excludes `tenant_id`: the keys table is
// dual-mode (control-plane keys have tenant_id IS NULL, tenant-scoped keys set
// it) and list() has no tenant_id WHERE clause, so allowing `q=tenant_id:other`
// would let callers read across tenant boundaries.
const ALLOWED_Q_FIELDS = [
  "kid",
  "connection",
  "fingerprint",
  "thumbprint",
  "type",
];

export function createKeysAdapter(db: DrizzleDb) {
  return {
    async create(key: SigningKey): Promise<void> {
      await db.insert(keys).values({
        ...key,
        created_at: new Date().toDateString(),
      });
    },

    async list(params?: ListParams) {
      const {
        page = 0,
        per_page = 50,
        include_totals = false,
        sort,
        q,
      } = params || {};

      const now = new Date().toISOString();

      const conditions = [
        or(gt(keys.revoked_at, now), isNull(keys.revoked_at))!,
      ];
      if (q) {
        // Sanitize first so only whitelisted fields reach buildLuceneFilter;
        // otherwise a clause like `q=tenant_id:other` would emit SQL against
        // arbitrary columns and bypass the dual-mode tenant boundary.
        const sanitized = sanitizeLuceneQuery(q, ALLOWED_Q_FIELDS);
        if (sanitized) {
          const filter = buildLuceneFilter(keys, sanitized, ALLOWED_Q_FIELDS);
          if (filter) conditions.push(filter);
        }
      }
      const whereClause = and(...conditions);

      let query = db.select().from(keys).where(whereClause).$dynamic();

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
        .where(whereClause);

      return {
        signingKeys,
        start: page * per_page,
        limit: per_page,
        length: getCountAsInt(countResult?.count ?? 0),
      };
    },

    async update(
      kid: string,
      signingKey: Partial<SigningKey>,
    ): Promise<boolean> {
      const results = await db
        .update(keys)
        .set(signingKey as any)
        .where(eq(keys.kid, kid))
        .returning();

      return results.length > 0;
    },
  };
}
