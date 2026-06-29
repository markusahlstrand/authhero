import { Kysely } from "kysely";
import { HTTPException } from "hono/http-exception";
import { Database } from "../db";
import {
  Organization,
  OrganizationInsert,
  CreateOptions,
} from "@authhero/adapter-interfaces";
import { generateOrganizationId } from "../utils/entity-id";

export function create(db: Kysely<Database>) {
  return async (
    tenantId: string,
    organization: OrganizationInsert,
    options?: CreateOptions,
  ): Promise<Organization> => {
    const importMetadata = options?.importMetadata;
    const now = new Date().toISOString();
    const sqlOrganization = {
      ...organization,
      id: importMetadata?.id || organization.id || generateOrganizationId(),
      tenant_id: tenantId,
      created_at: importMetadata?.created_at ?? now,
      updated_at: importMetadata?.updated_at ?? now,
      branding: JSON.stringify(organization.branding || {}),
      metadata: JSON.stringify(organization.metadata || {}),
      enabled_connections: JSON.stringify(
        organization.enabled_connections || [],
      ),
      token_quota: JSON.stringify(organization.token_quota || {}),
    };

    try {
      await db.insertInto("organizations").values(sqlOrganization).execute();
    } catch (err: any) {
      if (
        err.code === "SQLITE_CONSTRAINT_UNIQUE" ||
        err.code === "ER_DUP_ENTRY" ||
        err.message.includes("AlreadyExists")
      ) {
        throw new HTTPException(409, {
          message: "Organization already exists",
        });
      }
      throw err;
    }

    return {
      ...organization,
      id: sqlOrganization.id,
      created_at: sqlOrganization.created_at,
      updated_at: sqlOrganization.updated_at,
    };
  };
}
