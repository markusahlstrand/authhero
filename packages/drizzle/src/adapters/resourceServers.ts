import { eq, and, count as countFn, asc, desc, like, sql } from "drizzle-orm";
import type { ResourceServer, ListParams } from "@authhero/adapter-interfaces";
import { resourceServers } from "../schema/sqlite";
import { removeNullProperties, parseJsonIfString } from "../helpers/transform";
import type { DrizzleDb } from "./types";

function generateResourceServerId(): string {
  const { customAlphabet } = require("nanoid");
  const generate = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 17);
  return `api_${generate()}`;
}

const BOOLEAN_FIELDS = [
  "skip_consent_for_verifiable_first_party_clients",
  "allow_offline_access",
  "is_system",
] as const;

function sqlToResourceServer(row: any): ResourceServer {
  const { tenant_id: _, verification_key, scopes, options, metadata, ...rest } = row;
  const result: any = { ...rest };

  result.scopes = parseJsonIfString(scopes, []);
  result.options = parseJsonIfString(options, {});
  result.metadata = parseJsonIfString(metadata);

  if (verification_key !== undefined) {
    result.verificationKey = verification_key;
  }

  for (const field of BOOLEAN_FIELDS) {
    if (rest[field] !== undefined && rest[field] !== null) {
      result[field] = !!rest[field];
    }
  }

  return removeNullProperties(result);
}

export function createResourceServersAdapter(
  db: DrizzleDb,
) {
  return {
    async create(tenant_id: string, params: any): Promise<ResourceServer> {
      const now = new Date().toISOString();
      const id = params.id || generateResourceServerId();

      const values: any = {
        id,
        tenant_id,
        identifier: params.identifier,
        name: params.name,
        signing_alg: params.signing_alg,
        signing_secret: params.signing_secret,
        token_lifetime: params.token_lifetime,
        token_lifetime_for_web: params.token_lifetime_for_web,
        scopes: JSON.stringify(params.scopes || []),
        options: JSON.stringify(params.options || {}),
        metadata: params.metadata ? JSON.stringify(params.metadata) : undefined,
        verification_key: params.verificationKey || params.verification_key,
        created_at: now,
        updated_at: now,
      };

      for (const field of BOOLEAN_FIELDS) {
        if ((params as any)[field] !== undefined) {
          values[field] = (params as any)[field] ? 1 : 0;
        }
      }

      // Ensure is_system has a value matching the DB default so the
      // returned object is consistent with the persisted row.
      if (values.is_system === undefined) {
        values.is_system = 0;
      }

      await db.insert(resourceServers).values(values);

      return sqlToResourceServer({ ...values, tenant_id });
    },

    async get(
      tenant_id: string,
      id: string,
    ): Promise<ResourceServer | null> {
      const result = await db
        .select()
        .from(resourceServers)
        .where(
          and(
            eq(resourceServers.tenant_id, tenant_id),
            eq(resourceServers.id, id),
          ),
        )
        .get();

      if (!result) return null;
      return sqlToResourceServer(result);
    },

    async update(
      tenant_id: string,
      id: string,
      params: Partial<ResourceServer>,
    ): Promise<boolean> {
      const updateData: any = {
        updated_at: new Date().toISOString(),
      };

      if (params.name !== undefined) updateData.name = params.name;
      if (params.identifier !== undefined)
        updateData.identifier = params.identifier;
      if (params.signing_alg !== undefined)
        updateData.signing_alg = params.signing_alg;
      if (params.signing_secret !== undefined)
        updateData.signing_secret = params.signing_secret;
      if (params.token_lifetime !== undefined)
        updateData.token_lifetime = params.token_lifetime;
      if (params.token_lifetime_for_web !== undefined)
        updateData.token_lifetime_for_web = params.token_lifetime_for_web;
      if (params.scopes !== undefined)
        updateData.scopes = JSON.stringify(params.scopes);
      if (params.options !== undefined) {
        // Merge atomically in the database using SQLite's json_patch
        updateData.options = sql`json_patch(COALESCE(${resourceServers.options}, '{}'), ${JSON.stringify(params.options)})`;
      }
      if (params.metadata !== undefined)
        updateData.metadata = JSON.stringify(params.metadata);
      if ((params as any).verificationKey !== undefined)
        updateData.verification_key = (params as any).verificationKey;

      for (const field of BOOLEAN_FIELDS) {
        if ((params as any)[field] !== undefined) {
          updateData[field] = (params as any)[field] ? 1 : 0;
        }
      }

      const results = await db
        .update(resourceServers)
        .set(updateData)
        .where(
          and(
            eq(resourceServers.tenant_id, tenant_id),
            eq(resourceServers.id, id),
          ),
        )
        .returning();

      return results.length > 0;
    },

    async list(tenant_id: string, params?: ListParams) {
      const { page: rawPage = 0, per_page: rawPerPage = 50, include_totals = false, sort, q } =
        params || {};
      const page = Math.max(0, Math.floor(Number(rawPage) || 0));
      const per_page = Math.min(Math.max(1, Math.floor(Number(rawPerPage) || 50)), 500);

      const whereConditions = [eq(resourceServers.tenant_id, tenant_id)];

      if (q) {
        // Custom filter for resource servers: name and identifier with LIKE
        const match = q.match(/^([^:]+):(.+)$/);
        if (match) {
          const [, field, value] = match;
          const isNegation = field?.startsWith("-");
          const cleanField = isNegation ? field?.substring(1) : field;
          const col = (resourceServers as any)[cleanField!];
          if (col && !isNegation) {
            whereConditions.push(like(col, `%${value}%`));
          }
        }
      }

      let query = db
        .select()
        .from(resourceServers)
        .where(and(...whereConditions))
        .$dynamic();

      if (sort?.sort_by) {
        const col = (resourceServers as any)[sort.sort_by];
        if (col) {
          query = query.orderBy(
            sort.sort_order === "desc" ? desc(col) : asc(col),
          );
        }
      }

      const results = await query.offset(page * per_page).limit(per_page);
      const mapped = results.map(sqlToResourceServer);

      if (!include_totals) {
        return { resource_servers: mapped };
      }

      const [countResult] = await db
        .select({ count: countFn() })
        .from(resourceServers)
        .where(and(...whereConditions));

      return {
        resource_servers: mapped,
        start: page * per_page,
        limit: per_page,
        length: Number(countResult?.count ?? 0),
      };
    },

    async remove(tenant_id: string, id: string): Promise<boolean> {
      const results = await db
        .delete(resourceServers)
        .where(
          and(
            eq(resourceServers.tenant_id, tenant_id),
            eq(resourceServers.id, id),
          ),
        )
        .returning();

      return results.length > 0;
    },
  };
}
