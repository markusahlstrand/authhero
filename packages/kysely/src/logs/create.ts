import { Kysely } from "kysely";
import { nanoid } from "nanoid";
import { Log, LogType } from "@authhero/adapter-interfaces";
import { Database } from "../db";

function stringifyIfTruthy<T>(value: T | undefined): string | undefined {
  return value ? JSON.stringify(value) : undefined;
}

const USER_AGENT_MAX_LENGTH = 1024;

export function createLog(db: Kysely<Database>) {
  return async (tenant_id: string, log: Log): Promise<Log> => {
    const id = nanoid();
    const createdLog = {
      ...log,
      id,
      user_agent: log.user_agent.slice(0, USER_AGENT_MAX_LENGTH),
    };

    await db
      .insertInto("logs")
      .values({
        id,
        tenant_id,
        type: log.type as LogType, // Cast to LogType for database compatibility
        date: log.date,
        ip: log.ip,
        user_agent: createdLog.user_agent,
        // Optional fields
        description: createdLog.description?.substring(0, 256),
        isMobile: log.isMobile ? 1 : 0,
        scope: log.scope?.join(","),
        auth0_client: stringifyIfTruthy(log.auth0_client),
        details: stringifyIfTruthy(log.details)?.substring(0, 8192),
        user_id: log.user_id,
        user_name: log.user_name,
        connection: log.connection,
        connection_id: log.connection_id,
        client_id: log.client_id,
        client_name: log.client_name,
        audience: log.audience,
        strategy: log.strategy,
        strategy_type: log.strategy_type,
        hostname: log.hostname,
      })
      .execute();

    return createdLog;
  };
}
