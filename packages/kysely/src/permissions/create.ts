import { nanoid } from "nanoid";
import { Kysely } from "kysely";
import {
  Permission,
  PermissionInsert,
  permissionSchema,
} from "@authhero/adapter-interfaces";
import { Database, sqlPermissionSchema } from "../db";
import { z } from "@hono/zod-openapi";

type PermissionDbInsert = z.infer<typeof sqlPermissionSchema>;

export function create(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    params: PermissionInsert,
  ): Promise<Permission> => {
    const id = nanoid();
    const withId = { id, ...params };
    const permission = permissionSchema.parse(withId);

    const { sources, ...rest } = permission;

    const dbPermission: PermissionDbInsert = {
      id,
      ...rest,
      tenant_id,
      sources: sources ? JSON.stringify(sources) : "[]",
    };

    await db.insertInto("permissions").values(dbPermission).execute();

    return permission;
  };
}
