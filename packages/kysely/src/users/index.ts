import { Kysely } from "kysely";
import { create } from "./create";
import { get } from "./get";
import { list } from "./list";
import { remove } from "./remove";
import { update } from "./update";
import { unlink } from "./unlink";
import { Database, databaseOptions } from "../db";
import { UserDataAdapter } from "@authhero/adapter-interfaces";

export function createUsersAdapter(
  db: Kysely<Database>,
  databaseOptions: databaseOptions,
): UserDataAdapter {
  return {
    create: create(db, databaseOptions),
    remove: remove(db),
    get: get(db),
    list: list(db),
    update: update(db),
    // TODO - think about this more when other issues fixed
    unlink: unlink(db),
  };
}
