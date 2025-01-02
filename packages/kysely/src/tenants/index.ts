import { Kysely } from "kysely";
import { create } from "./create";
import { get } from "./get";
import { list } from "./list";
import { update } from "./update";
import { remove } from "./remove";
import { TenantsDataAdapter } from "@authhero/adapter-interfaces";
import { Database } from "../db";

export function createTenantsAdapter(db: Kysely<Database>): TenantsDataAdapter {
  return {
    create: create(db),
    get: get(db),
    list: list(db),
    update: update(db),
    remove: remove(db),
  };
}
