import { Kysely } from "kysely";
import { PermissionsAdapter } from "@authhero/adapter-interfaces";
import { Database } from "../db";
import { create } from "./create";
import { get } from "./get";
import { list } from "./list";
import { update } from "./update";
import { remove } from "./remove";

export function createPermissionsAdapter(
  db: Kysely<Database>,
): PermissionsAdapter {
  return {
    create: create(db),
    get: get(db),
    list: list(db),
    update: update(db),
    remove: remove(db),
  };
}
