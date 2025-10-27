import { Kysely } from "kysely";
import { create } from "./create";
import { get } from "./get";
import { list } from "./list";
import { remove } from "./remove";
import { update } from "./update";
import { Database } from "../db";
import { InvitesAdapter } from "@authhero/adapter-interfaces";

export function createInvitesAdapter(db: Kysely<Database>): InvitesAdapter {
  return {
    create: create(db),
    get: get(db),
    list: list(db),
    remove: remove(db),
    update: update(db),
  };
}
