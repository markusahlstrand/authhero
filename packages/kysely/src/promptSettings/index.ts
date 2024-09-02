import { PromptSettingsAdapter } from "@authhero/adapter-interfaces";
import { get } from "./get";
import { set } from "./set";
import { Kysely } from "kysely";
import { Database } from "../db";

export function createPromptSettingsAdapter(
  db: Kysely<Database>,
): PromptSettingsAdapter {
  return {
    get: get(db),
    set: set(db),
  };
}
