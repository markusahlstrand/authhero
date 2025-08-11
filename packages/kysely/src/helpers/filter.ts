import { Kysely, SelectQueryBuilder } from "kysely";
import { Database } from "../db";

export function luceneFilter<TB extends keyof Database>(
  db: Kysely<Database>,
  qb: SelectQueryBuilder<Database, TB, {}>,
  query: string,
  searchableColumns: string[],
) {
  const filters = query
    .split(/\s+/)
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
      // Generic single-word search across specified columns
      qb = qb.where((eb) =>
        eb.or(
          searchableColumns.map((col) => eb(ref(col), "like", `%${value}%`)),
        ),
      );
    }
  });

  return qb;
}
