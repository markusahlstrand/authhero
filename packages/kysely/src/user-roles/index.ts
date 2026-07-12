import { Kysely } from "kysely";
import { Database } from "../db";
import { list } from "./list";
import { listUsers } from "./list-users";
import { create } from "./create";
import { remove } from "./remove";

export function userRoles(db: Kysely<Database>) {
  return {
    list: list(db),
    listUsers: listUsers(db),
    create: create(db),
    remove: remove(db),
  };
}
