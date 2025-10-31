import { Kysely } from "kysely";
import { nanoid } from "nanoid";
import { LogInsert, Log } from "@authhero/adapter-interfaces";
import { Database } from "../db";

function stringifyIfTruthy<T>(value: T | undefined): string | undefined {
  return value ? JSON.stringify(value) : undefined;
}

const USER_AGENT_MAX_LENGTH = 1024;

export function createLog(db: Kysely<Database>) {
  return async (tenant_id: string, log: LogInsert): Promise<Log> => {
    const id = log.log_id || nanoid();
    const truncatedUserAgent = log.user_agent.slice(0, USER_AGENT_MAX_LENGTH);

    await db
      .insertInto("logs")
      .values({
        id,
        tenant_id,
        ...log,
        user_agent: truncatedUserAgent,
        description: log.description?.substring(0, 256),
        isMobile: log.isMobile ? 1 : 0,
        scope: log.scope?.join(","),
        auth0_client: stringifyIfTruthy(log.auth0_client),
        details: stringifyIfTruthy(log.details)?.substring(0, 8192),
      })
      .execute();

    return {
      ...log,
      log_id: id,
      user_agent: truncatedUserAgent,
    };
  };
}
