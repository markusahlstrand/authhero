import { Kysely } from "kysely";
import { create } from "./create";
import { remove } from "./remove";
import { list } from "./list";
import { Database } from "../db";

export function userPermissions(db: Kysely<Database>) {
  return {
    create: create(db),
    remove: remove(db),
    list: list(db),
  };
}
