import {
  AuditEvent,
  LogStream,
  LogStreamsAdapter,
} from "@authhero/adapter-interfaces";
import { EventDestination } from "../outbox-relay";

const DEFAULT_DELIVERY_TIMEOUT_MS = 10_000;

interface LogStreamData {
  date: string;
  type: string;
  description?: string;
  tenant_name: string;
  ip: string;
  user_agent?: string;
  user_id?: string;
  user_name?: string;
  client_id?: string;
  connection?: string;
  strategy?: string;
  strategy_type?: string;
  audience?: string;
  scope?: string;
  hostname?: string;
  auth0_client?: unknown;
  location_info?: unknown;
  details: {
    request: {
      method: string;
      path: string;
      qs?: Record<string, string>;
      body?: unknown;
    };
    response?: { statusCode: number; body?: unknown };
  };
}

// Auth0-compatible wire shape: top-level log_id + description, with the
// remaining fields nested under `data`. Logstash/Datadog pipelines built for
// Auth0 use `%{[data]}` to extract the body, so the nesting is load-bearing.
interface LogStreamPayload {
  log_id: string;
  description?: string;
  data: LogStreamData;
}

interface StreamDelivery {
  tenantId: string;
  logType: string;
  payload: LogStreamPayload;
}

function toPayload(event: AuditEvent): LogStreamPayload {
  return {
    log_id: event.id,
    description: event.description,
    data: {
      date: event.timestamp,
      type: event.log_type,
      description: event.description,
      tenant_name: event.tenant_id,
      ip: event.request.ip,
      user_agent: event.request.user_agent,
      user_id: event.actor.id,
      user_name: event.actor.email,
      client_id: event.actor.client_id,
      connection: event.connection,
      strategy: event.strategy,
      strategy_type: event.strategy_type,
      audience: event.audience,
      scope: event.scope || event.actor.scopes?.join(" "),
      hostname: event.hostname,
      auth0_client: event.auth0_client,
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
    },
  };
}

function passesFilters(stream: LogStream, logType: string): boolean {
  if (!stream.filters || stream.filters.length === 0) return true;
  return stream.filters.some((f) => f.name === logType);
}

function encodeBody(
  format: string | undefined,
  payload: LogStreamPayload,
): string {
  switch (format) {
    case "JSONOBJECT":
      return JSON.stringify(payload);
    case "JSONLINES":
      return JSON.stringify(payload) + "\n";
    case "JSONARRAY":
    default:
      return JSON.stringify([payload]);
  }
}

/**
 * Delivers audit events to tenant-configured HTTP log streams. Mirrors
 * Auth0's log_stream wire shape so Loki / Logstash / Datadog sinks
 * configured for an Auth0 tenant can be pointed at authhero unchanged.
 *
 * One delivery per (event, stream) — does not batch events into a single
 * POST because the outbox relay invokes `deliver` per-event. JSONARRAY is
 * therefore a single-element array; consumers expecting batched arrays
 * should still parse correctly.
 */
export class LogStreamDestination implements EventDestination {
  name = "log-streams";
  private logStreams: LogStreamsAdapter;
  private timeoutMs: number;

  constructor(logStreams: LogStreamsAdapter, options?: { timeoutMs?: number }) {
    this.logStreams = logStreams;
    this.timeoutMs = options?.timeoutMs ?? DEFAULT_DELIVERY_TIMEOUT_MS;
  }

  accepts(event: AuditEvent): boolean {
    return (
      !event.event_type.startsWith("hook.") &&
      !event.event_type.startsWith("controlplane.sync.")
    );
  }

  transform(event: AuditEvent): StreamDelivery {
    return {
      tenantId: event.tenant_id,
      logType: event.log_type,
      payload: toPayload(event),
    };
  }

  async deliver(events: StreamDelivery[]): Promise<void> {
    for (const { tenantId, logType, payload } of events) {
      const streams = await this.logStreams.list(tenantId);
      const activeHttpStreams = streams.filter(
        (s) => s.type === "http" && s.status === "active",
      );
      if (activeHttpStreams.length === 0) continue;

      for (const stream of activeHttpStreams) {
        if (!passesFilters(stream, logType)) continue;
        await this.deliverToStream(stream, payload);
      }
    }
  }

  private async deliverToStream(
    stream: LogStream,
    payload: LogStreamPayload,
  ): Promise<void> {
    const sink = stream.sink as {
      http_endpoint?: string;
      http_authorization?: string;
      http_content_type?: string;
      http_content_format?: string;
      http_custom_headers?: Array<{ header: string; value: string }>;
    };

    if (!sink.http_endpoint) {
      throw new Error(`Log stream ${stream.id} is missing sink.http_endpoint`);
    }

    const headers: Record<string, string> = {
      "Content-Type": sink.http_content_type || "application/json",
    };
    if (sink.http_authorization) {
      headers["Authorization"] = sink.http_authorization;
    }
    if (Array.isArray(sink.http_custom_headers)) {
      for (const h of sink.http_custom_headers) {
        if (h && typeof h.header === "string" && typeof h.value === "string") {
          headers[h.header] = h.value;
        }
      }
    }

    const body = encodeBody(sink.http_content_format, payload);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(sink.http_endpoint, {
        method: "POST",
        headers,
        body,
        signal: controller.signal,
      });
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(
          `Log stream ${stream.id} returned ${response.status}: ${text.slice(0, 256)}`,
        );
      }
    } finally {
      clearTimeout(timer);
    }
  }
}
