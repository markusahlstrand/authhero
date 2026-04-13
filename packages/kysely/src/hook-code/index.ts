import { Kysely } from "kysely";
import { HookCodeAdapter } from "@authhero/adapter-interfaces";
import { Database } from "../db";
import { create } from "./create";
import { get } from "./get";
import { update } from "./update";
import { remove } from "./remove";

export function createHookCodeAdapter(db: Kysely<Database>): HookCodeAdapter {
  return {
    create: create(db),
    get: get(db),
    update: update(db),
    remove: remove(db),
  };
}
