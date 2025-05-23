import { create } from "./create";
import { Kysely } from "kysely";
import { list } from "./list";
import { remove } from "./remove";
import { get } from "./get";
import { update } from "./update";
import { FormsAdapter } from "@authhero/adapter-interfaces";
import { Database } from "../db";

export function createFormsAdapter(db: Kysely<Database>): FormsAdapter {
  return {
    create: create(db),
    get: get(db),
    list: list(db),
    remove: remove(db),
    update: update(db),
  };
}
