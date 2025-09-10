import { Kysely } from "kysely";
import { HTTPException } from "hono/http-exception";
import { Database } from "../db";
import { Organization, OrganizationInsert } from "@authhero/adapter-interfaces";
import { nanoid } from "nanoid";

export function create(db: Kysely<Database>) {
  return async (
    tenantId: string,
    organization: OrganizationInsert,
  ): Promise<Organization> => {
    const sqlOrganization = {
      ...organization,
      id: organization.id || nanoid(),
      tenant_id: tenantId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
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
