import { TenantSettingsAdapter } from "@authhero/adapter-interfaces";
import { get } from "./get";
import { set } from "./set";
import { Kysely } from "kysely";
import { Database } from "../db";

export function createTenantSettingsAdapter(
  db: Kysely<Database>,
): TenantSettingsAdapter {
  return {
    get: get(db),
    set: set(db),
  };
}
