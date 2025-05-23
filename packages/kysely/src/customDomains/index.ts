import { create } from "./create";
import { Kysely } from "kysely";
import { list } from "./list";
import { CustomDomainsAdapter } from "@authhero/adapter-interfaces";
import { Database } from "../db";
import { remove } from "./remove";
import { get } from "./get";
import { update } from "./update";
import { getByDomain } from "./getByDomain";

export function createCustomDomainsAdapter(
  db: Kysely<Database>,
): CustomDomainsAdapter {
  return {
    create: create(db),
    get: get(db),
    getByDomain: getByDomain(db),
    list: list(db),
    remove: remove(db),
    update: update(db),
  };
}
