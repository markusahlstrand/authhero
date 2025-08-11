import { Kysely } from "kysely";
import { RulesAdapter } from "@authhero/adapter-interfaces";
import { Database } from "../db";
import { create } from "./create";
import { get } from "./get";
import { list } from "./list";
import { remove } from "./remove";
import { update } from "./update";

export function createRulesAdapter(db: Kysely<Database>): RulesAdapter {
  return {
    create: create(db),
    get: get(db),
    list: list(db),
    remove: remove(db),
    update: update(db),
  };
}
