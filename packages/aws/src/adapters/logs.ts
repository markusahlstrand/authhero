import { nanoid } from "nanoid";
import {
  LogsDataAdapter,
  Log,
  LogInsert,
  ListParams,
} from "@authhero/adapter-interfaces";
import { DynamoDBContext, DynamoDBBaseItem } from "../types";
import { logKeys } from "../keys";
import {
  getItem,
  putItem,
  queryWithPagination,
  stripDynamoDBFields,
  removeNullProperties,
} from "../utils";

interface LogItem extends DynamoDBBaseItem {
  log_id: string;
  tenant_id: string;
  type: string;
  description?: string;
  ip?: string;
  user_agent?: string;
  date: string;
  user_id?: string;
  user_name?: string;
  connection?: string;
  connection_id?: string;
  client_id?: string;
  client_name?: string;
  audience?: string;
  scope?: string;
  strategy?: string;
  strategy_type?: string;
  hostname?: string;
  isMobile: boolean;
  auth0_client?: string; // JSON string
  details?: string; // JSON string
  // Location info (flattened)
  country_code?: string;
  city_name?: string;
  latitude?: string;
  longitude?: string;
  time_zone?: string;
  continent_code?: string;
}

function toLog(item: LogItem): Log {
  const { tenant_id, country_code, city_name, latitude, longitude, time_zone, continent_code, ...rest } = stripDynamoDBFields(item);

  return removeNullProperties({
    ...rest,
    auth0_client: item.auth0_client ? JSON.parse(item.auth0_client) : undefined,
    details: item.details ? JSON.parse(item.details) : undefined,
    location_info: country_code
      ? {
          country_code,
          city_name: city_name!,
          latitude: latitude!,
          longitude: longitude!,
          time_zone: time_zone!,
          continent_code: continent_code!,
        }
      : undefined,
  }) as Log;
}

export function createLogsAdapter(ctx: DynamoDBContext): LogsDataAdapter {
  return {
    async create(tenantId: string, log: LogInsert): Promise<Log> {
      const now = new Date().toISOString();
      const logId = log.log_id || nanoid();
      const date = log.date || now;
      const datePrefix = date.substring(0, 10); // YYYY-MM-DD

      const item: LogItem = {
        PK: logKeys.pk(tenantId),
        SK: logKeys.sk(logId),
        GSI1PK: logKeys.gsi1pk(tenantId, datePrefix),
        GSI1SK: logKeys.gsi1sk(logId),
        entityType: "LOG",
        tenant_id: tenantId,
        log_id: logId,
        type: log.type,
        description: log.description,
        ip: log.ip,
        user_agent: log.user_agent,
        date,
        user_id: log.user_id,
        user_name: log.user_name,
        connection: log.connection,
        connection_id: log.connection_id,
        client_id: log.client_id,
        client_name: log.client_name,
        audience: log.audience,
        scope: log.scope,
        strategy: log.strategy,
        strategy_type: log.strategy_type,
        hostname: log.hostname,
        isMobile: log.isMobile,
        auth0_client: log.auth0_client
          ? JSON.stringify(log.auth0_client)
          : undefined,
        details: log.details ? JSON.stringify(log.details) : undefined,
        country_code: log.location_info?.country_code,
        city_name: log.location_info?.city_name,
        latitude: log.location_info?.latitude,
        longitude: log.location_info?.longitude,
        time_zone: log.location_info?.time_zone,
        continent_code: log.location_info?.continent_code,
        created_at: now,
        updated_at: now,
      };

      // Set TTL for log retention (e.g., 30 days)
      const ttlDate = new Date(date);
      ttlDate.setDate(ttlDate.getDate() + 30);
      (item as any).ttl = Math.floor(ttlDate.getTime() / 1000);

      await putItem(ctx, item);

      return toLog(item);
    },

    async list(
      tenantId: string,
      params: ListParams = {},
    ): Promise<{ logs: Log[]; start: number; limit: number; length: number }> {
      const result = await queryWithPagination<LogItem>(
        ctx,
        logKeys.pk(tenantId),
        params,
        { skPrefix: "LOG#", scanIndexForward: false },
      );

      return {
        logs: result.items.map(toLog),
        start: result.start,
        limit: result.limit,
        length: result.length,
      };
    },

    async get(tenantId: string, logId: string): Promise<Log | null> {
      const item = await getItem<LogItem>(
        ctx,
        logKeys.pk(tenantId),
        logKeys.sk(logId),
      );

      if (!item) return null;

      return toLog(item);
    },
  };
}
