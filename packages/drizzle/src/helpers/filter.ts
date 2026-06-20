import {
  eq,
  ne,
  gt,
  gte,
  lt,
  lte,
  like,
  notLike,
  and,
  or,
  isNull,
  isNotNull,
  SQL,
  sql,
} from "drizzle-orm";
import type { SQLiteTableWithColumns } from "drizzle-orm/sqlite-core";

// Strip field-scoped clauses (`field:value`, `-field:value`, `_exists_:field`,
// `field=value`) whose field is not in `allowedFields`. Bare-string tokens are
// preserved (buildLuceneFilter routes them through its own searchable-columns
// whitelist). Returns a query string safe to pass into buildLuceneFilter.
//
// Ported from the kysely adapter so both adapters share the same tenant-boundary
// protection: without it a clause like `q=tenant_id:other` would emit SQL
// against arbitrary columns.
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

/**
 * Apply a Lucene-style filter query string to a Drizzle query.
 * Returns an array of SQL conditions that should be applied with `and()`.
 *
 * Supports:
 * - field:value exact match
 * - field:>value, field:>=value, field:<value, field:<=value comparisons
 * - -field:value negation
 * - _exists_:field / -_exists_:field null checks
 * - field:value OR field:value disjunctions
 * - Unqualified search terms (search across specified columns with LIKE)
 * - Quoted values: field:"value with spaces"
 * - likeFields: fields matched with substring LIKE instead of exact equality
 *   (e.g. free-text log descriptions), mirroring the kysely adapter.
 */
export function buildLuceneFilter<T extends SQLiteTableWithColumns<any>>(
  table: T,
  query: string,
  searchableColumns: string[],
  likeFields: string[] = [],
): SQL | undefined {
  const likeSet = new Set(likeFields);

  // Handle OR queries
  const orParts = query.split(/ OR /i);

  if (orParts.length > 1) {
    const conditions = orParts
      .map((orPart) => {
        const match = orPart.trim().match(/^([^:]+):(.+)$/);
        if (match) {
          const [, field, value] = match;
          if (!field || !value) return null;
          const fieldName = field.trim();
          const cleanValue = value.replace(/^"(.*)"$/, "$1").trim();
          const col = (table as any)[fieldName];
          if (!col) return null;
          return likeSet.has(fieldName)
            ? like(col, `%${cleanValue}%`)
            : eq(col, cleanValue);
        }
        return null;
      })
      .filter(Boolean) as SQL[];

    if (conditions.length === 0) return undefined;
    return or(...conditions);
  }

  // Tokenize while respecting quoted strings
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
    .map((q) => q.replace(/^([^:]+)=/g, "$1:"))
    .map((filter) => {
      let isNegation = filter.startsWith("-");
      let key: string | null = null;
      let value = "";
      let isExistsQuery = false;
      let operator: string | undefined;

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

  const conditions: SQL[] = [];

  for (const { key, value, isNegation, isExistsQuery, operator } of filters) {
    if (key) {
      const col = (table as any)[key];
      if (!col) {
        // Use raw SQL for unknown columns
        if (isExistsQuery) {
          conditions.push(
            isNegation
              ? sql`${sql.identifier(key)} IS NULL`
              : sql`${sql.identifier(key)} IS NOT NULL`,
          );
        } else {
          conditions.push(
            sql`${sql.identifier(key)} ${sql.raw(isNegation ? "!=" : (operator ?? "="))} ${value}`,
          );
        }
        continue;
      }

      if (isExistsQuery) {
        conditions.push(isNegation ? isNull(col) : isNotNull(col));
      } else if (likeSet.has(key) && operator === "=") {
        // Substring match for free-text fields (e.g. log descriptions),
        // where exact-match is rarely useful.
        conditions.push(
          isNegation ? notLike(col, `%${value}%`) : like(col, `%${value}%`),
        );
      } else if (isNegation) {
        switch (operator) {
          case ">":
            conditions.push(lte(col, value));
            break;
          case ">=":
            conditions.push(lt(col, value));
            break;
          case "<":
            conditions.push(gte(col, value));
            break;
          case "<=":
            conditions.push(gt(col, value));
            break;
          default:
            conditions.push(ne(col, value));
        }
      } else {
        switch (operator) {
          case ">":
            conditions.push(gt(col, value));
            break;
          case ">=":
            conditions.push(gte(col, value));
            break;
          case "<":
            conditions.push(lt(col, value));
            break;
          case "<=":
            conditions.push(lte(col, value));
            break;
          default:
            conditions.push(eq(col, value));
        }
      }
    } else if (value) {
      // Generic search across searchable columns
      const columnsToSearch = value.includes("|")
        ? [...searchableColumns, "user_id"]
        : searchableColumns;

      const searchConditions = columnsToSearch
        .map((colName) => {
          const col = (table as any)[colName];
          if (!col) return null;
          return colName === "user_id"
            ? eq(col, value)
            : like(col, `%${value}%`);
        })
        .filter(Boolean) as SQL[];

      if (searchConditions.length > 0) {
        conditions.push(or(...searchConditions)!);
      }
    }
  }

  if (conditions.length === 0) return undefined;
  if (conditions.length === 1) return conditions[0];
  return and(...conditions);
}
