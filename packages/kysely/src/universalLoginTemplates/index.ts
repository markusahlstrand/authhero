import { UniversalLoginTemplatesAdapter } from "@authhero/adapter-interfaces";
import { get } from "./get";
import { set } from "./set";
import { del } from "./delete";
import { Kysely } from "kysely";
import { Database } from "../db";

export function createUniversalLoginTemplatesAdapter(
  db: Kysely<Database>,
): UniversalLoginTemplatesAdapter {
  return {
    get: get(db),
    set: set(db),
    delete: del(db),
  };
}
