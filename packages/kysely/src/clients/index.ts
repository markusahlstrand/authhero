import { Kysely } from "kysely";
import { ClientsAdapter } from "@authhero/adapter-interfaces";
import { Database } from "../db";
import { create } from "./create";
import { get } from "./get";
import { getByClientId } from "./getByClientId";
import { list } from "./list";
import { remove } from "./remove";
import { update } from "./update";

export function createClientsAdapter(db: Kysely<Database>): ClientsAdapter {
  return {
    create: create(db),
    get: get(db),
    getByClientId: getByClientId(db),
    list: list(db),
    remove: remove(db),
    update: update(db),
  };
}
