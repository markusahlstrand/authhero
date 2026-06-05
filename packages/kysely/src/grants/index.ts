import { Kysely } from "kysely";
import { GrantsAdapter } from "@authhero/adapter-interfaces";
import { Database } from "../db";
import { create } from "./create";
import { get } from "./get";
import { list } from "./list";
import { remove, removeByUser } from "./remove";

export function createGrantsAdapter(db: Kysely<Database>): GrantsAdapter {
  return {
    create: create(db),
    get: get(db),
    list: list(db),
    remove: remove(db),
    removeByUser: removeByUser(db),
  };
}
