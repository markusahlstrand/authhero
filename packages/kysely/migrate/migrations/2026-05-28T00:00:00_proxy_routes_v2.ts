import { Kysely, sql } from "kysely";

type LegacyRow = {
  id: string;
  path_pattern: string;
  upstream_type: string;
  upstream_url: string;
  preserve_host: number;
  middleware: string | null;
};

type LegacyMiddleware = {
  type: string;
  [key: string]: unknown;
};

function migrateMiddleware(raw: string | null): unknown[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((m: LegacyMiddleware) => {
      const { type, ...options } = m;
      return { type, options };
    });
  } catch {
    return [];
  }
}

function buildHandlers(row: LegacyRow): unknown[] {
  const middleware = migrateMiddleware(row.middleware);
  const terminalType =
    row.upstream_type === "authhero" ? "http" : row.upstream_type;
  const terminal = {
    type: terminalType,
    options: {
      upstream_url: row.upstream_url,
      preserve_host: row.preserve_host !== 0,
    },
  };
  return [...middleware, terminal];
}

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("proxy_routes")
    .addColumn("match", "varchar(2048)", (col) =>
      col.notNull().defaultTo('{"path":"/*"}'),
    )
    .execute();

  await db.schema
    .alterTable("proxy_routes")
    .addColumn("handlers", "text", (col) => col.notNull().defaultTo("[]"))
    .execute();

  const rows = await (
    db as unknown as Kysely<{
      proxy_routes: LegacyRow;
    }>
  )
    .selectFrom("proxy_routes")
    .select([
      "id",
      "path_pattern",
      "upstream_type",
      "upstream_url",
      "preserve_host",
      "middleware",
    ])
    .execute();

  for (const row of rows) {
    const match = { path: row.path_pattern || "/*" };
    const handlers = buildHandlers(row);
    await (
      db as unknown as Kysely<{
        proxy_routes: { id: string; match: string; handlers: string };
      }>
    )
      .updateTable("proxy_routes")
      .set({
        match: JSON.stringify(match),
        handlers: JSON.stringify(handlers),
      })
      .where("id", "=", row.id)
      .execute();
  }

  await db.schema
    .alterTable("proxy_routes")
    .dropColumn("path_pattern")
    .execute();
  await db.schema
    .alterTable("proxy_routes")
    .dropColumn("upstream_type")
    .execute();
  await db.schema
    .alterTable("proxy_routes")
    .dropColumn("upstream_url")
    .execute();
  await db.schema
    .alterTable("proxy_routes")
    .dropColumn("preserve_host")
    .execute();
  await db.schema.alterTable("proxy_routes").dropColumn("middleware").execute();

  // Silence the noisy unused import.
  void sql;
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("proxy_routes")
    .addColumn("path_pattern", "varchar(512)", (col) =>
      col.notNull().defaultTo("/*"),
    )
    .execute();
  await db.schema
    .alterTable("proxy_routes")
    .addColumn("upstream_type", "varchar(32)", (col) =>
      col.notNull().defaultTo("http"),
    )
    .execute();
  await db.schema
    .alterTable("proxy_routes")
    .addColumn("upstream_url", "varchar(2048)", (col) =>
      col.notNull().defaultTo(""),
    )
    .execute();
  await db.schema
    .alterTable("proxy_routes")
    .addColumn("preserve_host", "integer", (col) => col.notNull().defaultTo(0))
    .execute();
  await db.schema
    .alterTable("proxy_routes")
    .addColumn("middleware", "varchar(8192)", (col) =>
      col.notNull().defaultTo("[]"),
    )
    .execute();
  await db.schema.alterTable("proxy_routes").dropColumn("match").execute();
  await db.schema.alterTable("proxy_routes").dropColumn("handlers").execute();
}
