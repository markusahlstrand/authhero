import { Kysely, SelectQueryBuilder } from "kysely";
import { Database } from "../db";

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

export function luceneFilter<TB extends keyof Database>(
  db: Kysely<Database>,
  qb: SelectQueryBuilder<Database, TB, {}>,
  query: string,
  searchableColumns: string[],
) {
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
            const cleanValue = value.replace(/^"(.*)"$/, "$1"); // Remove quotes
            return eb(field.trim() as any, "=", cleanValue.trim());
          }
          return null;
        })
        .filter(Boolean);

      return eb.or(conditions as any);
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
      } else {
        key = null;
        value = filter;
        isExistsQuery = false;
      }

      return { key, value, isNegation, isExistsQuery, operator };
    });

  // Apply filters to the query builder
  filters.forEach(({ key, value, isNegation, isExistsQuery, operator }) => {
    if (key) {
      if (isExistsQuery) {
        if (isNegation) {
          qb = qb.where(key as any, "is", null);
        } else {
          qb = qb.where(key as any, "is not", null);
        }
      } else {
        if (isNegation) {
          switch (operator) {
            case ">":
              qb = qb.where(key as any, "<=", value);
              break;
            case ">=":
              qb = qb.where(key as any, "<", value);
              break;
            case "<":
              qb = qb.where(key as any, ">=", value);
              break;
            case "<=":
              qb = qb.where(key as any, ">", value);
              break;
            default:
              qb = qb.where(key as any, "!=", value);
          }
        } else {
          qb = qb.where(key as any, operator as any, value);
        }
      }
    } else if (value) {
      const { ref } = db.dynamic;
      qb = qb.where((eb) =>
        eb.or(
          searchableColumns.map((col) =>
            col === "user_id"
              ? eb(ref(col), "=", value) // Exact match for user_id (e.g. "auth0|12345")
              : eb(ref(col), "like", `%${value}%`),
          ),
        ),
      );
    }
  });

  return qb;
}
