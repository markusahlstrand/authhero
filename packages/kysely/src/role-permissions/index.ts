import { Kysely } from "kysely";
import { assign } from "./assign";
import { remove } from "./remove";
import { list } from "./list";
import { Database } from "../db";

export function rolePermissions(db: Kysely<Database>) {
  return {
    assign: assign(db),
    remove: remove(db),
    list: list(db),
  };
}
