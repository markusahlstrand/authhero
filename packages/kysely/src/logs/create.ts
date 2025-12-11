import { Kysely } from "kysely";
import { nanoid } from "nanoid";
import { LogInsert, Log } from "@authhero/adapter-interfaces";
import { Database } from "../db";

function stringifyIfTruthy<T>(value: T | undefined): string | undefined {
  return value ? JSON.stringify(value) : undefined;
}

const USER_AGENT_MAX_LENGTH = 256;

export function createLog(db: Kysely<Database>) {
  return async (tenant_id: string, log: LogInsert): Promise<Log> => {
    const truncatedUserAgent = log.user_agent?.slice(0, USER_AGENT_MAX_LENGTH);

    const log_id = log.log_id || nanoid();

    // Destructure to exclude location_info from the spread
    const { location_info, ...logWithoutLocationInfo } = log;

    await db
      .insertInto("logs")
      .values({
        ...logWithoutLocationInfo,
        log_id,
        tenant_id,
        user_agent: truncatedUserAgent,
        description: log.description?.substring(0, 256),
        isMobile: log.isMobile ? 1 : 0,
        scope: log.scope,
        auth0_client: stringifyIfTruthy(log.auth0_client),
        details: stringifyIfTruthy(log.details)?.substring(0, 8192),
        // Extract location_info fields for separate columns
        country_code: location_info?.country_code,
        city_name: location_info?.city_name,
        latitude: location_info?.latitude,
        longitude: location_info?.longitude,
        time_zone: location_info?.time_zone,
        continent_code: location_info?.continent_code,
      })
      .execute();

    return {
      ...log,
      log_id,
      user_agent: truncatedUserAgent,
    };
  };
}
