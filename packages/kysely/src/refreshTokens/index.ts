import { RefreshTokensAdapter } from "@authhero/adapter-interfaces";
import { get } from "./get";
import { getByLookup } from "./getByLookup";
import { create } from "./create";
import { Kysely } from "kysely";
import { remove } from "./remove";
import { revokeByLoginSession } from "./revokeByLoginSession";
import { revokeByUser } from "./revokeByUser";
import { revokeFamily } from "./revokeFamily";
import { update } from "./update";
import { list } from "./list";
import { Database } from "../db";

export function createRefreshTokensAdapter(
  db: Kysely<Database>,
): RefreshTokensAdapter {
  return {
    create: create(db),
    get: get(db),
    getByLookup: getByLookup(db),
    list: list(db),
    remove: remove(db),
    revokeByLoginSession: revokeByLoginSession(db),
    revokeByUser: revokeByUser(db),
    revokeFamily: revokeFamily(db),
    update: update(db),
  };
}
