import { Kysely } from "kysely";
import { Database } from "../db";
import { list } from "./list";
import { create } from "./create";
import { remove } from "./remove";

export function userRoles(db: Kysely<Database>) {
  return {
    list: list(db),
    create: create(db),
    remove: remove(db),
  };
}
