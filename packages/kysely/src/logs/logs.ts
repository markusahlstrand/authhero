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
    scope: log.scope ? log.scope.split(",") : undefined,
    log_id: log.id,
  };
  return logResponse;
}
