import { get } from "./get";
import { create } from "./create";
import { update } from "./update";
import { list } from "./list";
import { Kysely } from "kysely";
import { PasswordsAdapter } from "@authhero/adapter-interfaces";
import { Database } from "../db";

export function createPasswordAdapter(db: Kysely<Database>): PasswordsAdapter {
  return {
    create: create(db),
    update: update(db),
    get: get(db),
    list: list(db),
  };
}
