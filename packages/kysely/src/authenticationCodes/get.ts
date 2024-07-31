import { HTTPException } from "hono/http-exception";
import { AuthenticationCode } from "@authhero/adapter-interfaces";
import { Kysely } from "kysely";
import { Database } from "../db";

export function get(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    code: string,
  ): Promise<AuthenticationCode> => {
    const result = await db
      .selectFrom("authentication_codes")
      .where("tenant_id", "=", tenant_id)
      .where("code", "=", code)
      .selectAll()
      .executeTakeFirst();

    if (!result) {
      throw new HTTPException(403, { message: "Code not found or expired" });
    }

    const {
      state,
      nonce,
      scope,
      client_id,
      response_type,
      response_mode,
      redirect_uri,
      ...rest
    } = result;

    return {
      ...rest,
      authParams: {
        state,
        nonce,
        scope,
        client_id,
        response_type,
        response_mode,
        redirect_uri,
      },
    };
  };
}
