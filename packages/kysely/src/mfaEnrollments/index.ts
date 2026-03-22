import { Kysely } from "kysely";
import { MfaEnrollmentsAdapter } from "@authhero/adapter-interfaces";
import { Database } from "../db";
import { create } from "./create";
import { get } from "./get";
import { list } from "./list";
import { update } from "./update";
import { remove } from "./remove";

export function createMfaEnrollmentsAdapter(
  db: Kysely<Database>,
): MfaEnrollmentsAdapter {
  return {
    create: create(db),
    get: get(db),
    list: list(db),
    update: update(db),
    remove: remove(db),
  };
}
