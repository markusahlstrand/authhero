import { Kysely, SelectQueryBuilder, sql } from "kysely";
import { Database } from "../db";

// A field backed by a nullable LEFT-JOINed column that the public shape
// presents with a numeric default (e.g. `login_count` -> 0 when the user has
// no user_activity row). Comparisons wrap the column in COALESCE so rows
// without a joined row still match, and bind the operand as a number: a
// COALESCE expression has no column affinity in SQLite, so a string operand
// would compare as text and never match.
export type CoalescedNumericField = {
  column: string;
  defaultValue: number;
};

export type FieldMapping = string | CoalescedNumericField;

export function coalescedRef(field: CoalescedNumericField) {
  return sql`coalesce(${sql.ref(field.column)}, ${sql.lit(field.defaultValue)})`;
}

// Re-exported so existing `../helpers/filter` imports keep working; the
// implementation is shared with the drizzle adapter via adapter-interfaces.
export { sanitizeLuceneQuery } from "@authhero/adapter-interfaces";
import {
  isEmailSearchTerm,
  splitLuceneOrGroups,
  unescapeLuceneValue,
} from "@authhero/adapter-interfaces";

// Generic over the query builder's DB type (not just `Database`) because
// left-joined builders carry a widened DB type with nullable joined columns.
export function luceneFilter<DB, TB extends keyof DB, O>(
  db: Kysely<Database>,
  qb: SelectQueryBuilder<DB, TB, O>,
  query: string,
  searchableColumns: string[],
  likeFields: string[] = [],
  // Maps a public field name to a qualified column ref (e.g.
  // `login_count` -> `user_activity.login_count`). Needed when the query
  // joins tables that share column names, where an unqualified ref would be
  // ambiguous. Fields not in the map are used as-is. A CoalescedNumericField
  // value additionally makes comparisons NULL-aware (see its doc above).
  fieldMap: Record<string, FieldMapping> = {},
) {
  const likeSet = new Set(likeFields);
  const { ref } = db.dynamic;
  const toColumn = (field: string): string => {
    const mapped = fieldMap[field];
    if (mapped === undefined) return field;
    return typeof mapped === "string" ? mapped : mapped.column;
  };
  // Left-hand side for comparison clauses; unlike toColumn this wraps
  // coalesced fields in their COALESCE expression. Dynamic references go
  // through `db.dynamic.ref` so runtime-resolved column names stay typed.
  const toLhs = (field: string) => {
    const mapped = fieldMap[field];
    if (mapped === undefined || typeof mapped === "string") {
      return ref(mapped ?? field);
    }
    return coalescedRef(mapped);
  };
  const toOperand = (field: string, value: string): string | number => {
    const mapped = fieldMap[field];
    if (mapped === undefined || typeof mapped === "string") return value;
    const num = Number(value);
    return Number.isFinite(num) ? num : value;
  };
  // Tokenize (quote-aware) and split on the OR operator. The split runs on
  // tokens rather than on the raw string so a quoted value containing ` OR `
  // stays one literal instead of breaking out into extra clauses.
  const orGroups = splitLuceneOrGroups(query);

  if (orGroups.length > 1) {
    // Handle OR query - combine all groups with OR logic, conjoining the
    // clauses within each group.
    return qb.where((eb) => {
      const conditions = orGroups
        .map((groupTokens) => {
          // For simplicity, just parse field:value pairs directly
          const groupConditions = groupTokens
            .map((token) => {
              const match = token.match(/^([^:]+):(.+)$/);
              if (!match) return null;
              const [, field, value] = match;
              if (!field || !value) return null;
              const fieldName = field.trim();
              const cleanValue = unescapeLuceneValue(
                value.replace(/^"(.*)"$/, "$1").trim(),
              );
              if (likeSet.has(fieldName)) {
                return eb(ref(toColumn(fieldName)), "like", `%${cleanValue}%`);
              }
              return eb(
                toLhs(fieldName),
                "=",
                toOperand(fieldName, cleanValue),
              );
            })
            .filter((condition) => condition !== null);

          if (groupConditions.length === 0) return null;
          if (groupConditions.length === 1) return groupConditions[0]!;
          return eb.and(groupConditions);
        })
        .filter((condition) => condition !== null);

      return eb.or(conditions);
    });
  }

  // Original logic for AND queries, over the single remaining token group
  const tokens = orGroups[0] ?? [];

  const filters = tokens
    // `AND` is the implicit conjunction in Lucene (operators are uppercase),
    // so a literal `AND` between clauses is a no-op marker. Without this
    // drop the token would fall through to the bare-value branch below and
    // be turned into a `LIKE '%AND%'` free-text search across every
    // searchable column, silently matching zero rows for queries like
    // `type:jwt_signing AND -_exists_:tenant_id`.
    .filter((q) => q !== "AND")
    // This handles queries that incorrectly are using a = instead of :
    .map((q) => q.replace(/^([^:]+)=/g, "$1:"))
    .map((filter) => {
      let isNegation = filter.startsWith("-");
      let key: any = null,
        value: any = "",
        isExistsQuery: any = false,
        operator: any = undefined;

      if (filter.startsWith("-_exists_:")) {
        key = filter.substring(10);
        isExistsQuery = true;
        isNegation = true;
      } else if (filter.startsWith("_exists_:")) {
        key = filter.substring(9);
        isExistsQuery = true;
        isNegation = false;
      } else if (filter.includes(":")) {
        const raw = isNegation ? filter.substring(1) : filter;
        const idx = raw.indexOf(":");
        key = raw.substring(0, idx);
        value = raw.substring(idx + 1);
        isExistsQuery = false;

        if (value.startsWith(">=")) {
          operator = ">=";
          value = value.substring(2);
        } else if (value.startsWith(">")) {
          operator = ">";
          value = value.substring(1);
        } else if (value.startsWith("<=")) {
          operator = "<=";
          value = value.substring(2);
        } else if (value.startsWith("<")) {
          operator = "<";
          value = value.substring(1);
        } else {
          operator = "=";
        }

        // Strip surrounding quotes from the value (proper Lucene syntax support)
        // This must happen AFTER operator parsing
        if (value.startsWith('"') && value.endsWith('"') && value.length > 1) {
          value = value.slice(1, -1);
        }

        // Reverse client-side Lucene escaping (e.g. `\-` -> `-`) so the operand
        // matches the stored value rather than a backslash-prefixed literal.
        value = unescapeLuceneValue(value);
      } else {
        key = null;
        value = unescapeLuceneValue(filter);
        isExistsQuery = false;
      }

      return { key, value, isNegation, isExistsQuery, operator };
    });

  // Apply filters to the query builder
  filters.forEach(({ key, value, isNegation, isExistsQuery, operator }) => {
    if (key) {
      const column = ref(toColumn(key));
      const lhs = toLhs(key);
      const operand = toOperand(key, value);
      if (isExistsQuery) {
        if (isNegation) {
          qb = qb.where(column, "is", null);
        } else {
          qb = qb.where(column, "is not", null);
        }
      } else if (likeSet.has(key) && operator === "=") {
        // Substring match for free-text fields (e.g. log descriptions),
        // where exact-match is rarely useful.
        qb = qb.where(column, isNegation ? "not like" : "like", `%${value}%`);
      } else {
        if (isNegation) {
          switch (operator) {
            case ">":
              qb = qb.where(lhs, "<=", operand);
              break;
            case ">=":
              qb = qb.where(lhs, "<", operand);
              break;
            case "<":
              qb = qb.where(lhs, ">=", operand);
              break;
            case "<=":
              qb = qb.where(lhs, ">", operand);
              break;
            default:
              qb = qb.where(lhs, "!=", operand);
          }
        } else {
          qb = qb.where(lhs, operator, operand);
        }
      }
    } else if (value) {
      // A bare token that is a full email address can only match the email
      // column, so resolve it with an indexed equality lookup instead of a
      // leading-wildcard LIKE across every searchable column. Emails are
      // stored lowercased, so the term is lowercased too (a no-op under
      // MySQL's case-insensitive collation, but SQLite's `=` is not).
      if (searchableColumns.includes("email") && isEmailSearchTerm(value)) {
        qb = qb.where(ref(toColumn("email")), "=", value.toLowerCase());
        return;
      }

      qb = qb.where((eb) =>
        eb.or(
          searchableColumns.map((col) =>
            col === "user_id"
              ? eb(ref(toColumn(col)), "=", value) // Exact match for user_id (e.g. "auth0|12345")
              : eb(ref(toColumn(col)), "like", `%${value}%`),
          ),
        ),
      );
    }
  });

  return qb;
}
