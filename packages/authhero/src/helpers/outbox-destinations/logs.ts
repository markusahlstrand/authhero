import {
  AuditEvent,
  LogInsert,
  LogType,
  LogsDataAdapter,
} from "@authhero/adapter-interfaces";
import { EventDestination } from "../outbox-relay";

/**
 * Transforms AuditEvent into LogInsert for the existing logs table.
 * This preserves backward compatibility — the management API GET /logs
 * endpoints continue to work unchanged.
 */
function toLogInsert(event: AuditEvent): LogInsert {
  return {
    log_id: event.id,
    type: event.log_type as LogType,
    date: event.timestamp,
    description: event.description || "",
    ip: event.request.ip,
    user_agent: event.request.user_agent || "",
    user_id: event.actor.id || "",
    user_name: event.actor.email || "",
    client_id: event.actor.client_id,
    client_name: "",
    connection: event.connection,
    strategy: event.strategy,
    strategy_type: event.strategy_type,
    audience: "",
    scope: event.actor.scopes?.join(" "),
    hostname: event.hostname,
    auth0_client: event.auth0_client,
    isMobile: event.is_mobile || false,
    location_info: event.location,
    details: {
      request: {
        method: event.request.method,
        path: event.request.path,
        qs: event.request.query,
        body: event.request.body,
      },
      ...(event.response && {
        response: {
          statusCode: event.response.status_code,
          body: event.response.body,
        },
      }),
    },
  };
}

export class LogsDestination implements EventDestination {
  name = "logs";
  private logs: LogsDataAdapter;

  constructor(logs: LogsDataAdapter) {
    this.logs = logs;
  }

  transform(event: AuditEvent): { tenantId: string; log: LogInsert } {
    return {
      tenantId: event.tenant_id,
      log: toLogInsert(event),
    };
  }

  async deliver(events: { tenantId: string; log: LogInsert }[]): Promise<void> {
    for (const { tenantId, log } of events) {
      try {
        await this.logs.create(tenantId, log);
      } catch (error) {
        // Idempotent: if this event was already delivered (e.g., cron retry after
        // per-request delivery succeeded but markProcessed failed), skip it.
        const message = error instanceof Error ? error.message : String(error);
        if (
          message.includes("UNIQUE constraint failed") ||
          message.includes("Duplicate entry")
        ) {
          continue;
        }
        throw error;
      }
    }
  }
}
