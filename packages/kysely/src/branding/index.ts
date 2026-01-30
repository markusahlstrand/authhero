import { BrandingAdapter } from "@authhero/adapter-interfaces";
import { get } from "./get";
import { set } from "./set";
import { setUniversalLoginTemplate } from "./setUniversalLoginTemplate";
import { getUniversalLoginTemplate } from "./getUniversalLoginTemplate";
import { deleteUniversalLoginTemplate } from "./deleteUniversalLoginTemplate";
import { Kysely } from "kysely";
import { Database } from "../db";

export function createBrandingAdapter(db: Kysely<Database>): BrandingAdapter {
  return {
    get: get(db),
    set: set(db),
    setUniversalLoginTemplate: setUniversalLoginTemplate(db),
    getUniversalLoginTemplate: getUniversalLoginTemplate(db),
    deleteUniversalLoginTemplate: deleteUniversalLoginTemplate(db),
  };
}
