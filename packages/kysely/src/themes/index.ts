import { create } from "./create";
import { Kysely } from "kysely";
import { remove } from "./remove";
import { get } from "./get";
import { list } from "./list";
import { update } from "./update";
import { ThemesAdapter } from "@authhero/adapter-interfaces";
import { Database } from "../db";

export function createThemesAdapter(db: Kysely<Database>): ThemesAdapter {
  return {
    create: create(db),
    get: get(db),
    list: list(db),
    remove: remove(db),
    update: update(db),
  };
}
