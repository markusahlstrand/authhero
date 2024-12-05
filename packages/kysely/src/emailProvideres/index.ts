import { EmailProvidersAdapter } from "@authhero/adapter-interfaces";
import { get } from "./get";
import { update } from "./update";
import { Kysely } from "kysely";
import { Database } from "../db";
import { create } from "./create";

export function createEmailProvidersAdapter(
  db: Kysely<Database>,
): EmailProvidersAdapter {
  return {
    get: get(db),
    create: create(db),
    update: update(db),
  };
}
