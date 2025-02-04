import { RefreshTokensAdapter } from "@authhero/adapter-interfaces";
import { get } from "./get";
import { create } from "./create";
import { Kysely } from "kysely";
import { remove } from "./remove";
import { update } from "./update";
import { list } from "./list";
import { Database } from "../db";

export function createRefreshTokensAdapter(
  db: Kysely<Database>,
): RefreshTokensAdapter {
  return {
    create: create(db),
    get: get(db),
    list: list(db),
    remove: remove(db),
    update: update(db),
  };
}
