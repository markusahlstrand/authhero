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
  is,
  getTableColumns,
  Column,
  SQL,
  sql,
} from "drizzle-orm";
import { SQLiteTable } from "drizzle-orm/sqlite-core";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";

// A filter target backed by a nullable LEFT-JOINed column that the public
// shape presents with a numeric default (e.g. `login_count` -> 0 when the
// user has no user_activity row). Comparisons wrap the column in COALESCE so
// rows without a joined row still match, and bind the operand as a number: a
// COALESCE expression has no column affinity in SQLite, so a string operand
// would compare as text and never match.
export type CoalescedNumericColumn = {
  coalesce: AnySQLiteColumn;
  defaultValue: number;
};

export function isCoalescedNumericColumn(
  value: unknown,
): value is CoalescedNumericColumn {
  return (
    typeof value === "object" &&
    value !== null &&
    "coalesce" in value &&
    "defaultValue" in value
  );
}

export function coalescedExpr(mapping: CoalescedNumericColumn): SQL {
  return sql`coalesce(${mapping.coalesce}, ${mapping.defaultValue})`;
}

// Re-exported so existing `../helpers/filter` imports keep working; the
// implementation is shared with the kysely adapter via adapter-interfaces,
// so both adapters get the same tenant-boundary protection: without it a
// clause like `q=tenant_id:other` would emit SQL against arbitrary columns.
export { sanitizeLuceneQuery } from "@authhero/adapter-interfaces";
import {
  isEmailSearchTerm,
  splitLuceneOrGroups,
  unescapeLuceneValue,
} from "@authhero/adapter-interfaces";

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
 *
 * `table` can also be a plain field→column map. Use that when the query joins
 * several tables (e.g. users + user_activity) so each public field resolves to
 * a column of the right table.
 */
export function buildLuceneFilter(
  table: SQLiteTable | Record<string, unknown>,
  query: string,
  searchableColumns: string[],
  likeFields: string[] = [],
): SQL | undefined {
  // Normalize to a plain field→value record so the lookups below stay typed;
  // `is()` + `getTableColumns()` avoid reaching into the table via `any`.
  const columns: Record<string, unknown> = is(table, SQLiteTable)
    ? getTableColumns(table)
    : table;
  const likeSet = new Set(likeFields);
  const toNumericOperand = (value: string): string | number => {
    const num = Number(value);
    return Number.isFinite(num) ? num : value;
  };

  // Tokenize (quote-aware) and split on the OR operator. The split runs on
  // tokens rather than on the raw string so a quoted value containing ` OR `
  // stays one literal instead of breaking out into extra clauses.
  const orGroups = splitLuceneOrGroups(query);

  if (orGroups.length > 1) {
    const conditions = orGroups
      .map((groupTokens) => {
        // Clauses within a group are conjoined (Lucene's implicit AND).
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
            const col = columns[fieldName];
            if (isCoalescedNumericColumn(col)) {
              return eq(coalescedExpr(col), toNumericOperand(cleanValue));
            }
            if (!is(col, Column)) return null;
            return likeSet.has(fieldName)
              ? like(col, `%${cleanValue}%`)
              : eq(col, cleanValue);
          })
          .filter((condition): condition is SQL => condition !== null);

        if (groupConditions.length === 0) return null;
        if (groupConditions.length === 1) return groupConditions[0]!;
        return and(...groupConditions) ?? null;
      })
      .filter((condition): condition is SQL => condition !== null);

    if (conditions.length === 0) return undefined;
    return or(...conditions);
  }

  // Single token group — the plain conjunction path.
  const tokens = orGroups[0] ?? [];

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

        // Reverse client-side Lucene escaping (e.g. `\-` -> `-`) so the operand
        // matches the stored value rather than a backslash-prefixed literal,
        // matching the kysely adapter.
        value = unescapeLuceneValue(value);
      } else {
        key = null;
        value = unescapeLuceneValue(filter);
        isExistsQuery = false;
      }

      return { key, value, isNegation, isExistsQuery, operator };
    });

  const conditions: SQL[] = [];

  for (const { key, value, isNegation, isExistsQuery, operator } of filters) {
    if (key) {
      const mapped = columns[key];
      // `_exists_` still checks the raw column — "no activity row" is the
      // meaningful NULL there, and COALESCE would make it never-null.
      const isCoalesced = isCoalescedNumericColumn(mapped);
      const col = isCoalesced
        ? mapped.coalesce
        : is(mapped, Column)
          ? mapped
          : undefined;
      const operand = isCoalesced ? toNumericOperand(value) : value;
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

      // Interpolating a Column into `sql` renders its qualified name, so both
      // arms produce the same SQL a bare-column operator call would.
      const lhs: SQL = isCoalesced ? coalescedExpr(mapped) : sql`${col}`;

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
            conditions.push(lte(lhs, operand));
            break;
          case ">=":
            conditions.push(lt(lhs, operand));
            break;
          case "<":
            conditions.push(gte(lhs, operand));
            break;
          case "<=":
            conditions.push(gt(lhs, operand));
            break;
          default:
            conditions.push(ne(lhs, operand));
        }
      } else {
        switch (operator) {
          case ">":
            conditions.push(gt(lhs, operand));
            break;
          case ">=":
            conditions.push(gte(lhs, operand));
            break;
          case "<":
            conditions.push(lt(lhs, operand));
            break;
          case "<=":
            conditions.push(lte(lhs, operand));
            break;
          default:
            conditions.push(eq(lhs, operand));
        }
      }
    } else if (value) {
      // A bare token that is a full email address can only match the email
      // column, so resolve it with an indexed equality lookup instead of a
      // leading-wildcard LIKE across every searchable column. Emails are
      // stored lowercased, so the term is lowercased too — SQLite's `=` is
      // case-sensitive, unlike its `LIKE`.
      const emailColumn = searchableColumns.includes("email")
        ? columns.email
        : undefined;
      if (isEmailSearchTerm(value) && is(emailColumn, Column)) {
        conditions.push(eq(emailColumn, value.toLowerCase()));
        continue;
      }

      // Generic search across searchable columns
      const columnsToSearch = value.includes("|")
        ? [...searchableColumns, "user_id"]
        : searchableColumns;

      const searchConditions = columnsToSearch
        .map((colName) => {
          const col = columns[colName];
          if (!is(col, Column)) return null;
          return colName === "user_id"
            ? eq(col, value)
            : like(col, `%${value}%`);
        })
        .filter((condition): condition is SQL => condition !== null);

      if (searchConditions.length > 0) {
        conditions.push(or(...searchConditions)!);
      }
    }
  }

  if (conditions.length === 0) return undefined;
  if (conditions.length === 1) return conditions[0];
  return and(...conditions);
}
