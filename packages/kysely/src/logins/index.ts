import { Kysely } from "kysely";
import { LoginsAdapter } from "@authhero/adapter-interfaces";
import { get } from "./get";
import { create } from "./create";
import { update } from "./update";
import { remove } from "./remove";
import { Database } from "../db";

export function createLoginAdapter(db: Kysely<Database>): LoginsAdapter {
  return {
    create: create(db),
    get: get(db),
    update: update(db),
    remove: remove(db),
  };
}
