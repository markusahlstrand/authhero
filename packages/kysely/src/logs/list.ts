import { Kysely } from "kysely";
import { ListParams } from "@authhero/adapter-interfaces";
import { luceneFilter, sanitizeLuceneQuery } from "../helpers/filter";
import { getLogResponse } from "./logs";
import { Database } from "../db";
import getCountAsInt from "../utils/getCountAsInt";

// Fields logs.list() accepts as `field:value` clauses in `q`. Every entry maps
// to a real column on the logs table. Excludes `tenant_id` so a clause like
// `q=tenant_id:other` cannot cross tenant boundaries, and excludes derived
// concepts such as `success` (no column) and JSON blobs. A clause referencing
// anything outside this list is stripped by sanitizeLuceneQuery before it
// reaches luceneFilter — otherwise it would emit SQL against a non-existent
// column and crash the request (e.g. a free-text term like `2024-01-01T10:00`
// gets misread as `2024-01-01T10:00` -> column reference).
const ALLOWED_Q_FIELDS = [
  "user_id",
  "ip",
  "type",
  "date",
  "client_id",
  "client_name",
  "user_agent",
  "description",
  "user_name",
  "connection",
  "connection_id",
  "audience",
  "scope",
  "strategy",
  "strategy_type",
  "hostname",
  "log_id",
  "session_connection",
  "country_code",
  "city_name",
  "latitude",
  "longitude",
  "time_zone",
  "continent_code",
];

export function listLogs(db: Kysely<Database>) {
  return async (tenant_id: string, params: ListParams = {}) => {
    const {
      page = 0,
      per_page = 50,
      include_totals = false,
      sort,
      q,
      from_date,
      to_date,
    } = params;

    let query = db.selectFrom("logs").where("logs.tenant_id", "=", tenant_id);

    if (q) {
      // Sanitize first so only whitelisted fields reach luceneFilter;
      // otherwise a free-text term containing a `:` (e.g. a timestamp) is
      // misparsed as `field:value` and emits SQL against a bogus column,
      // crashing the request.
      const sanitized = sanitizeLuceneQuery(q, ALLOWED_Q_FIELDS);
      if (sanitized) {
        // Bare free-text terms match user_id (exact), and ip + description
        // (substring). Searching description matters because a user's email
        // can appear there before login completes — i.e. before any user_id
        // exists to match against.
        query = luceneFilter(
          db,
          query,
          sanitized,
          ["user_id", "ip", "description"],
          ["description"],
        );
      }
    }

    if (typeof from_date === "number" && Number.isFinite(from_date)) {
      query = query.where(
        "logs.date",
        ">=",
        new Date(Math.floor(from_date) * 1000).toISOString(),
      );
    }
    if (typeof to_date === "number" && Number.isFinite(to_date)) {
      query = query.where(
        "logs.date",
        "<=",
        new Date(Math.floor(to_date) * 1000 + 999).toISOString(),
      );
    }

    let filteredQuery = query;

    if (sort && sort.sort_by) {
      const { ref } = db.dynamic;
      filteredQuery = filteredQuery.orderBy(ref(sort.sort_by), sort.sort_order);
    }

    filteredQuery = filteredQuery.offset(page * per_page).limit(per_page);

    const logs = await filteredQuery.selectAll().execute();

    const mappedLogs = logs.map(getLogResponse);

    if (!include_totals) {
      return {
        logs: mappedLogs,
        start: 0,
        limit: 0,
        length: 0,
      };
    }

    const { count } = await query
      .select((eb) => eb.fn.countAll().as("count"))
      .executeTakeFirstOrThrow();

    return {
      logs: mappedLogs,
      start: page * per_page,
      limit: per_page,
      length: getCountAsInt(count),
    };
  };
}
