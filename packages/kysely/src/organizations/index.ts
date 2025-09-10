import { Kysely } from "kysely";
import { create } from "./create";
import { get } from "./get";
import { list } from "./list";
import { remove } from "./remove";
import { update } from "./update";
import { Database } from "../db";
import { OrganizationsAdapter } from "@authhero/adapter-interfaces";

export function createOrganizationsAdapter(
  db: Kysely<Database>,
): OrganizationsAdapter {
  return {
    create: create(db),
    get: get(db),
    list: list(db),
    remove: remove(db),
    update: update(db),
  };
}
