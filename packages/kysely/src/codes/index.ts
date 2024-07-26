import { Kysely } from "kysely";
import { CodesAdapter } from "@authhero/adapter-interfaces";
import { Database } from "../db";
import { list } from "./list";
import { create } from "./create";
import { remove } from "./remove";
import { get } from "./get";

export function createCodesAdapter(db: Kysely<Database>): CodesAdapter {
  return {
    create: create(db),
    list: list(db),
    remove: remove(db),
    get: get(db),
  };
}