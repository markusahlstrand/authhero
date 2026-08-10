import { Kysely } from "kysely";
import { ActionExecutionsAdapter } from "@authhero/adapter-interfaces";
import { Database } from "../db";
import { create } from "./create";
import { get } from "./get";
import { cleanup } from "./cleanup";

export function createActionExecutionsAdapter(
  db: Kysely<Database>,
): ActionExecutionsAdapter {
  return {
    create: create(db),
    get: get(db),
    cleanup: cleanup(db),
  };
}
