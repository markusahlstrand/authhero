import { nanoid } from "nanoid";
import { Kysely } from "kysely";
import {
  ClientGrant,
  ClientGrantInsert,
  CreateOptions,
} from "@authhero/adapter-interfaces";
import { Database, sqlClientGrantSchema } from "../db";
import { removeNullProperties } from "../helpers/remove-nulls";
import { z } from "@hono/zod-openapi";

type ClientGrantDbInsert = z.infer<typeof sqlClientGrantSchema>;

export function create(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    params: ClientGrantInsert,
    options?: CreateOptions,
  ): Promise<ClientGrant> => {
    const importMetadata = options?.importMetadata;
    const now = new Date().toISOString();
    const id = importMetadata?.id ?? nanoid();
    const created_at = importMetadata?.created_at ?? now;
    // Preserve the source timestamp on import: fall back to the imported
    // created_at (not replay time) when updated_at is absent.
    const updated_at =
      importMetadata?.updated_at ?? importMetadata?.created_at ?? now;

    // Extract arrays for proper handling
    const { scope, authorization_details_types, ...rest } = params;

    // Prepare data for database (arrays as JSON strings, booleans as integers)
    const dbClientGrant: ClientGrantDbInsert = {
      id,
      tenant_id,
      ...rest,
      scope: scope ? JSON.stringify(scope) : "[]",
      authorization_details_types: authorization_details_types
        ? JSON.stringify(authorization_details_types)
        : "[]",
      // Convert booleans to integers for database storage
      allow_any_organization:
        rest.allow_any_organization !== undefined
          ? rest.allow_any_organization
            ? 1
            : 0
          : undefined,
      is_system:
        rest.is_system !== undefined ? (rest.is_system ? 1 : 0) : undefined,
      created_at,
      updated_at,
    };

    await db.insertInto("client_grants").values(dbClientGrant).execute();

    // Return with arrays as proper arrays for the API response
    return removeNullProperties({
      id,
      tenant_id,
      ...rest,
      scope: scope || [],
      authorization_details_types: authorization_details_types || [],
      // Ensure boolean fields have proper defaults
      allow_any_organization: rest.allow_any_organization ?? false,
      is_system: rest.is_system ?? false,
      created_at,
      updated_at,
    });
  };
}
