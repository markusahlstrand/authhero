import { Kysely } from "kysely";
import { UserConsentsAdapter } from "@authhero/adapter-interfaces";
import { Database } from "../db";
import { create } from "./create";
import { get } from "./get";
import { list } from "./list";
import { remove } from "./remove";

export function createUserConsentsAdapter(
  db: Kysely<Database>,
): UserConsentsAdapter {
  return {
    create: create(db),
    get: get(db),
    list: list(db),
    remove: remove(db),
  };
}
