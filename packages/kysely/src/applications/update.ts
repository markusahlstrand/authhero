import { Kysely } from "kysely";
import { ApplicationInsert } from "@authhero/adapter-interfaces";
import { Database } from "../db";

export function update(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    application_id: string,
    application: Partial<ApplicationInsert>,
  ): Promise<boolean> => {
    const sqlConnection = {
      ...application,
      updated_at: new Date().toISOString(),
    };

    await db
      .updateTable("applications")
      .set(sqlConnection)
      .where("applications.id", "=", application_id)
      .where("applications.tenant_id", "=", tenant_id)
      .execute();

    return true;
  };
}
