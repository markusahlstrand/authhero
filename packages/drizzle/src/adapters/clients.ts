import { eq, and, count as countFn, asc, desc } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import {
  ClientsAdapter,
  Client,
  ListParams,
} from "@authhero/adapter-interfaces";
import { clients } from "../schema/sqlite";
import {
  removeNullProperties,
  parseJsonIfString,
  booleanToInt,
  removeUndefinedAndNull,
} from "../helpers/transform";
import { buildLuceneFilter } from "../helpers/filter";
import type { DrizzleDb } from "./types";

const BOOLEAN_FIELDS = [
  "global",
  "is_first_party",
  "oidc_conformant",
  "auth0_conformant",
  "sso",
  "sso_disabled",
  "cross_origin_authentication",
  "custom_login_page_on",
  "require_pushed_authorization_requests",
  "require_proof_of_possession",
] as const;

const JSON_ARRAY_FIELDS = [
  "callbacks",
  "allowed_origins",
  "web_origins",
  "client_aliases",
  "allowed_clients",
  "allowed_logout_urls",
  "grant_types",
  "signing_keys",
] as const;

const JSON_OBJECT_FIELDS = [
  "session_transfer",
  "oidc_logout",
  "jwt_configuration",
  "encryption_key",
  "addons",
  "client_metadata",
  "mobile",
  "native_social_login",
  "refresh_token",
  "default_organization",
  "client_authentication_methods",
  "signed_request_object",
  "token_quota",
] as const;

function sqlToClient(row: any): Client {
  const { tenant_id: _, connections: conns, ...rest } = row;
  const result: any = { ...rest };

  for (const field of BOOLEAN_FIELDS) {
    result[field] = !!rest[field];
  }

  for (const field of JSON_ARRAY_FIELDS) {
    result[field] = parseJsonIfString(rest[field], []);
  }

  for (const field of JSON_OBJECT_FIELDS) {
    result[field] = parseJsonIfString(rest[field], {});
  }

  result.connections = parseJsonIfString(conns, []);

  return removeNullProperties(result);
}

function clientToSql(client: Partial<Client>): any {
  const sql: any = { ...client };

  booleanToInt(
    client,
    BOOLEAN_FIELDS as unknown as (keyof typeof client)[],
    sql,
  );

  for (const field of JSON_ARRAY_FIELDS) {
    if ((client as any)[field] !== undefined) {
      sql[field] = JSON.stringify((client as any)[field] || []);
    }
  }

  for (const field of JSON_OBJECT_FIELDS) {
    if ((client as any)[field] !== undefined) {
      sql[field] = JSON.stringify((client as any)[field] || {});
    }
  }

  if (client.connections !== undefined) {
    sql.connections = JSON.stringify(client.connections || []);
  }

  return removeUndefinedAndNull(sql);
}

export function createClientsAdapter(db: DrizzleDb): ClientsAdapter {
  return {
    async create(tenant_id: string, params: any): Promise<Client> {
      const now = new Date().toISOString();

      const client: any = {
        client_id: params.client_id,
        tenant_id,
        name: params.name,
        description: params.description,
        app_type: params.app_type ?? "regular_web",
        logo_uri: params.logo_uri,
        client_secret: params.client_secret,
        token_endpoint_auth_method:
          params.token_endpoint_auth_method ?? "client_secret_basic",
        cross_origin_loc: params.cross_origin_loc,
        custom_login_page: params.custom_login_page,
        custom_login_page_preview: params.custom_login_page_preview,
        form_template: params.form_template,
        initiate_login_uri: params.initiate_login_uri,
        organization_usage: params.organization_usage ?? "deny",
        organization_require_behavior:
          params.organization_require_behavior ?? "no_prompt",
        compliance_level: params.compliance_level,
        par_request_expiry: params.par_request_expiry,
        created_at: now,
        updated_at: now,
      };

      // Set boolean defaults
      for (const field of BOOLEAN_FIELDS) {
        client[field] = params[field] ?? false;
      }
      // Common overrides
      client.oidc_conformant = params.oidc_conformant ?? true;
      client.auth0_conformant = params.auth0_conformant ?? true;
      client.sso_disabled = params.sso_disabled ?? false;

      // Set array/object defaults
      for (const field of JSON_ARRAY_FIELDS) {
        client[field] = params[field] || [];
      }
      for (const field of JSON_OBJECT_FIELDS) {
        client[field] = params[field] || {};
      }
      client.connections = params.connections || [];

      const sqlClient = clientToSql(client);

      try {
        await db.insert(clients).values({ ...sqlClient, tenant_id });
      } catch (error: any) {
        if (
          error?.message?.includes("UNIQUE constraint failed") ||
          error?.message?.includes("duplicate key")
        ) {
          throw new HTTPException(409, {
            message: "Client already exists",
          });
        }
        throw error;
      }

      return sqlToClient({ ...sqlClient, tenant_id });
    },

    async get(tenant_id: string, client_id: string): Promise<Client | null> {
      const result = await db
        .select()
        .from(clients)
        .where(
          and(
            eq(clients.tenant_id, tenant_id),
            eq(clients.client_id, client_id),
          ),
        )
        .get();

      if (!result) return null;
      return sqlToClient(result);
    },

    async getByClientId(client_id: string) {
      const result = await db
        .select()
        .from(clients)
        .where(eq(clients.client_id, client_id))
        .get();

      if (!result) return null;

      return {
        ...sqlToClient(result),
        tenant_id: result.tenant_id,
      };
    },

    async update(
      tenant_id: string,
      client_id: string,
      params: Partial<Client>,
    ): Promise<boolean> {
      const sqlData = clientToSql({
        ...params,
        updated_at: new Date().toISOString(),
      } as any);

      // Remove fields that shouldn't be updated
      delete sqlData.client_id;
      delete sqlData.tenant_id;

      await db
        .update(clients)
        .set(sqlData)
        .where(
          and(
            eq(clients.tenant_id, tenant_id),
            eq(clients.client_id, client_id),
          ),
        );

      return true;
    },

    async list(tenant_id: string, params?: ListParams) {
      const {
        page = 0,
        per_page = 50,
        include_totals = false,
        sort,
        q,
      } = params || {};

      let query = db
        .select()
        .from(clients)
        .where(eq(clients.tenant_id, tenant_id))
        .$dynamic();

      if (q) {
        const filter = buildLuceneFilter(clients, q, ["name", "client_id"]);
        if (filter)
          query = query.where(and(eq(clients.tenant_id, tenant_id), filter));
      }

      if (sort?.sort_by) {
        const col = (clients as any)[sort.sort_by];
        if (col) {
          query = query.orderBy(
            sort.sort_order === "desc" ? desc(col) : asc(col),
          );
        }
      }

      const results = await query.offset(page * per_page).limit(per_page);
      const mapped = results.map(sqlToClient);

      if (!include_totals) {
        return { clients: mapped };
      }

      const [countResult] = await db
        .select({ count: countFn() })
        .from(clients)
        .where(eq(clients.tenant_id, tenant_id));

      return {
        clients: mapped,
        start: page * per_page,
        limit: per_page,
        length: Number(countResult?.count ?? 0),
      };
    },

    async remove(tenant_id: string, client_id: string): Promise<boolean> {
      const results = await db
        .delete(clients)
        .where(
          and(
            eq(clients.tenant_id, tenant_id),
            eq(clients.client_id, client_id),
          ),
        )
        .returning();

      return results.length > 0;
    },
  };
}
