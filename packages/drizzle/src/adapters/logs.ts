import { eq, and, count as countFn, asc, desc, gte, lt } from "drizzle-orm";
import { nanoid } from "nanoid";
import { HTTPException } from "hono/http-exception";
import type { Log, ListParams } from "@authhero/adapter-interfaces";
import { logs } from "../schema/sqlite";
import { removeNullProperties, parseJsonIfString } from "../helpers/transform";
import { buildLuceneFilter } from "../helpers/filter";
import {
  isKeysetRequest,
  keysetCondition,
  keysetOrderBy,
  keysetTake,
  sliceWithNext,
} from "../helpers/paginate";
import type { DrizzleDb } from "./types";

function sqlToLog(row: any): Log {
  const {
    tenant_id: _,
    isMobile,
    auth0_client,
    details,
    country_code,
    city_name,
    latitude,
    longitude,
    time_zone,
    continent_code,
    scope,
    ...rest
  } = row;

  const result: any = {
    ...rest,
    isMobile: !!isMobile,
    auth0_client: parseJsonIfString(auth0_client),
    details: parseJsonIfString(details),
    scope: scope ? scope.split(",") : undefined,
  };

  if (country_code) {
    result.location_info = removeNullProperties({
      country_code,
      city_name,
      latitude,
      longitude,
      time_zone,
      continent_code,
    });
  }

  return removeNullProperties(result);
}

export function createLogsAdapter(db: DrizzleDb) {
  return {
    async create(tenant_id: string, params: any): Promise<Log> {
      const log_id = params.log_id || nanoid();

      const values: any = {
        log_id,
        tenant_id,
        type: params.type,
        date: params.date || new Date().toISOString(),
        category: params.category,
        user_id: params.user_id,
        ip: params.ip,
        client_id: params.client_id,
        client_name: params.client_name,
        user_agent: params.user_agent?.substring(0, 256),
        description: params.description?.substring(0, 256),
        isMobile: params.isMobile ? 1 : 0,
        user_name: params.user_name,
        connection: params.connection,
        connection_id: params.connection_id,
        audience: params.audience,
        scope: Array.isArray(params.scope)
          ? params.scope.join(",")
          : params.scope,
        strategy: params.strategy,
        strategy_type: params.strategy_type,
        hostname: params.hostname,
        session_connection: params.session_connection,
      };

      // JSON fields
      if (params.auth0_client) {
        values.auth0_client = JSON.stringify(params.auth0_client);
      }
      if (params.details) {
        values.details = JSON.stringify(params.details).substring(0, 8192);
      }

      // Location info
      if (params.location_info) {
        values.country_code = params.location_info.country_code;
        values.city_name = params.location_info.city_name;
        values.latitude = params.location_info.latitude;
        values.longitude = params.location_info.longitude;
        values.time_zone = params.location_info.time_zone;
        values.continent_code = params.location_info.continent_code;
      }

      await db.insert(logs).values(values);

      return sqlToLog({ ...values, tenant_id });
    },

    async list(tenant_id: string, params?: ListParams) {
      const {
        page = 0,
        per_page = 50,
        include_totals = false,
        sort,
        q,
        from_date,
        to_date,
      } = params || {};

      const baseConditions = [eq(logs.tenant_id, tenant_id)];

      if (q) {
        // `description` is matched as a substring (likeField) to mirror the
        // kysely adapter, where free-text log descriptions use LIKE.
        const filter = buildLuceneFilter(
          logs,
          q,
          ["user_id", "ip", "type", "client_id"],
          ["description"],
        );
        if (filter) baseConditions.push(filter);
      }

      if (typeof from_date === "number" && Number.isFinite(from_date)) {
        baseConditions.push(
          gte(logs.date, new Date(Math.floor(from_date) * 1000).toISOString()),
        );
      }
      if (typeof to_date === "number" && Number.isFinite(to_date)) {
        baseConditions.push(
          lt(
            logs.date,
            new Date((Math.floor(to_date) + 1) * 1000).toISOString(),
          ),
        );
      }

      const whereClause = and(...baseConditions);

      // Keyset (checkpoint) pagination: from/take. Unlike Auth0 — which
      // ignores q/sort in checkpoint mode on /logs — the q and date-range
      // filters above stay in effect, and sorting by date (asc/desc) is
      // honored as a superset. Only `date` is keyset-sortable; log_id is the
      // unique tiebreaker.
      if (isKeysetRequest(params)) {
        if (sort?.sort_by && sort.sort_by !== "date") {
          throw new HTTPException(400, {
            message: `Sorting by ${sort.sort_by} is not supported with checkpoint pagination (from/take); only date is`,
          });
        }
        const sortOrder: "asc" | "desc" =
          sort?.sort_order === "asc" ? "asc" : "desc";
        const cols = {
          sortColumn: logs.date,
          idColumn: logs.log_id,
          sortOrder,
          sortKey: `date:${sortOrder}`,
        };
        const keyset = keysetCondition(params, cols);
        const take = keysetTake(params);
        const rows = await db
          .select()
          .from(logs)
          .where(keyset ? and(whereClause, keyset) : whereClause)
          .orderBy(...keysetOrderBy(cols))
          .limit(take + 1);
        const { rows: pageRows, next } = sliceWithNext(
          rows,
          take,
          "date",
          "log_id",
          cols.sortKey,
        );
        const mapped = pageRows.map(sqlToLog);
        return {
          logs: mapped,
          start: 0,
          limit: take,
          length: mapped.length,
          next,
        };
      }

      let query = db.select().from(logs).where(whereClause).$dynamic();

      if (sort?.sort_by) {
        const col = (logs as any)[sort.sort_by];
        if (col) {
          query = query.orderBy(
            sort.sort_order === "desc" ? desc(col) : asc(col),
          );
        }
      } else {
        query = query.orderBy(desc(logs.date));
      }

      const results = await query.offset(page * per_page).limit(per_page);
      const mapped = results.map(sqlToLog);

      if (!include_totals) {
        return { logs: mapped };
      }

      const [countResult] = await db
        .select({ count: countFn() })
        .from(logs)
        .where(whereClause);

      return {
        logs: mapped,
        start: page * per_page,
        limit: per_page,
        length: Number(countResult?.count ?? 0),
      };
    },

    async get(tenant_id: string, log_id: string): Promise<Log | null> {
      const result = await db
        .select()
        .from(logs)
        .where(and(eq(logs.tenant_id, tenant_id), eq(logs.log_id, log_id)))
        .get();

      if (!result) return null;
      return sqlToLog(result);
    },
  };
}
