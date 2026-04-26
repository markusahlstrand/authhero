import { Kysely } from "kysely";
import { ClientRegistrationTokensAdapter } from "@authhero/adapter-interfaces";
import { Database } from "../db";
import { create } from "./create";
import { get } from "./get";
import { getByHash } from "./getByHash";
import { listByClient } from "./listByClient";
import { markUsed } from "./markUsed";
import { revoke } from "./revoke";
import { revokeByClient } from "./revokeByClient";
import { remove } from "./remove";

export function createClientRegistrationTokensAdapter(
  db: Kysely<Database>,
): ClientRegistrationTokensAdapter {
  return {
    create: create(db),
    get: get(db),
    getByHash: getByHash(db),
    listByClient: listByClient(db),
    markUsed: markUsed(db),
    revoke: revoke(db),
    revokeByClient: revokeByClient(db),
    remove: remove(db),
  };
}
