import {
  AuthenticationMethod,
  AuthenticationMethodUpdate,
} from "@authhero/adapter-interfaces";
import { Kysely } from "kysely";
import { Database } from "../db";
import { get } from "./get";

export function update(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    method_id: string,
    data: AuthenticationMethodUpdate,
  ): Promise<AuthenticationMethod> => {
    const now = Date.now();

    const updateData: Record<string, unknown> = {
      updated_at_ts: now,
    };

    if (data.phone_number !== undefined) {
      updateData.phone_number = data.phone_number;
    }
    if (data.totp_secret !== undefined) {
      updateData.totp_secret = data.totp_secret;
    }
    if (data.credential_id !== undefined) {
      updateData.credential_id = data.credential_id;
    }
    if (data.public_key !== undefined) {
      updateData.public_key = data.public_key;
    }
    if (data.sign_count !== undefined) {
      updateData.sign_count = data.sign_count;
    }
    if (data.credential_backed_up !== undefined) {
      updateData.credential_backed_up = data.credential_backed_up ? 1 : 0;
    }
    if (data.transports !== undefined) {
      updateData.transports = JSON.stringify(data.transports);
    }
    if (data.friendly_name !== undefined) {
      updateData.friendly_name = data.friendly_name;
    }
    if (data.confirmed !== undefined) {
      updateData.confirmed = data.confirmed ? 1 : 0;
    }

    await db
      .updateTable("authentication_methods")
      .set(updateData)
      .where("authentication_methods.tenant_id", "=", tenant_id)
      .where("authentication_methods.id", "=", method_id)
      .execute();

    const result = await get(db)(tenant_id, method_id);
    if (!result) {
      throw new Error(`Authentication method ${method_id} not found`);
    }

    return result;
  };
}
