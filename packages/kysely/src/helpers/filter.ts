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

// Reverse Lucene escaping on a value operand: a backslash followed by a Lucene
// reserved character is a literal of that character (e.g. `auth0|abc\-123` ->
// `auth0|abc-123`). Clients (such as the admin UI) escape filter values per
// Lucene rules before interpolating them into the query string, so without this
// the backslash leaks into the SQL comparison and exact matches never hit.
function unescapeLuceneValue(value: string): string {
  return value.replace(/\\([\\"+\-!(){}[\]^~*?:/&|])/g, "$1");
}

// Strip field-scoped clauses (`field:value`, `-field:value`, `_exists_:field`,
// `field=value`) whose field is not in `allowedFields`. Bare-string tokens are
// preserved (luceneFilter routes them through its own searchable-columns
// whitelist). Returns a query string safe to pass into luceneFilter.
export function sanitizeLuceneQuery(
  query: string,
  allowedFields: string[],
): string {
  const allowed = new Set(allowedFields);

  const sanitizePart = (part: string): string => {
    const tokens: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < part.length; i++) {
      const char = part[i];
      if (char === '"') {
        inQuotes = !inQuotes;
        current += char;
      } else if (char === " " && !inQuotes) {
        if (current.trim()) tokens.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    if (current.trim()) tokens.push(current.trim());

    const kept = tokens.filter((token) => {
      const normalized = token.replace(/^([^:]+)=/, "$1:");
      const stripped = normalized.startsWith("-")
        ? normalized.slice(1)
        : normalized;

      if (stripped.startsWith("_exists_:")) {
        return allowed.has(stripped.slice(9));
      }
      const colonIdx = stripped.indexOf(":");
      if (colonIdx > 0) {
        return allowed.has(stripped.slice(0, colonIdx));
      }
      return true;
    });

    return kept.join(" ");
  };

  const orParts = query.split(/ OR /i);
  if (orParts.length > 1) {
    return orParts
      .map(sanitizePart)
      .filter((p) => p.length > 0)
      .join(" OR ");
  }
  return sanitizePart(query);
}

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
  // Split by OR first to handle OR queries
  const orParts = query.split(/ OR /i);

  if (orParts.length > 1) {
    // Handle OR query - combine all parts with OR logic
    return qb.where((eb) => {
      const conditions = orParts
        .map((orPart) => {
          // Process each OR part recursively to handle AND within it
          // For simplicity, just parse field:value pairs directly
          const match = orPart.trim().match(/^([^:]+):(.+)$/);
          if (match) {
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
          }
          return null;
        })
        .filter((condition) => condition !== null);

      return eb.or(conditions);
    });
  }

  // Original logic for AND queries
  // Tokenize the query while respecting quoted strings
  const tokens: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < query.length; i++) {
    const char = query[i];

    if (char === '"') {
      inQuotes = !inQuotes;
      current += char;
    } else if (char === " " && !inQuotes) {
      if (current.trim()) {
        tokens.push(current.trim());
        current = "";
      }
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    tokens.push(current.trim());
  }

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
