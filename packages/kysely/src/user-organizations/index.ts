import { Kysely } from "kysely";
import { create } from "./create";
import { get } from "./get";
import { list } from "./list";
import { remove } from "./remove";
import { update } from "./update";
import { Database } from "../db";
import { UserOrganizationsAdapter } from "@authhero/adapter-interfaces";

export function createUserOrganizationsAdapter(
  db: Kysely<Database>,
): UserOrganizationsAdapter {
  return {
    // CRUD operations
    create: create(db),
    get: get(db),
    list: list(db),
    remove: remove(db),
    update: update(db),
  };
}
