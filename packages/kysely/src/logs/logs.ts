import { Log } from "@authhero/adapter-interfaces";
import { Database } from "../db";

function tryParseJSON(jsonString?: string): any {
  if (!jsonString) {
    return "";
  }

  try {
    return JSON.parse(jsonString);
  } catch (e) {
    return jsonString;
  }
}

export function getLogResponse(log: Database["logs"]): Log {
  const logResponse: Log = {
    ...log,
    client_id: log.client_id,
    client_name: "",
    auth0_client: tryParseJSON(log.auth0_client),
    details: tryParseJSON(log.details),
    isMobile: !!log.isMobile,
    scope: log.scope || undefined,
    log_id: log.log_id,
    // Reconstruct location_info from separate columns
    location_info: log.country_code
      ? {
          country_code: log.country_code,
          city_name: log.city_name || "",
          latitude: log.latitude || "",
          longitude: log.longitude || "",
          time_zone: log.time_zone || "",
          continent_code: log.continent_code || "",
        }
      : undefined,
  };
  return logResponse;
}
