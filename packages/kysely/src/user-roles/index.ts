import { Kysely } from "kysely";
import { Database } from "../db";
import { list } from "./list";
import { assign } from "./assign";
import { remove } from "./remove";

export function userRoles(db: Kysely<Database>) {
  return {
    list: list(db),
    assign: assign(db),
    remove: remove(db),
  };
}
