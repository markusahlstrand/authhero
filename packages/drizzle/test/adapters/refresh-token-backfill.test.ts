import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

// The backfill (0007) is exercised directly rather than through the test
// server, because that helper applies every migration up front — leaving no
// point at which legacy rows exist to be backfilled. So: apply 0000-0006,
// seed the pre-migration state, then apply 0007 alone.
function applyUpTo(sqlite: Database.Database, lastTag: string) {
  const dir = path.join(__dirname, "../../drizzle");
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(dir, file), "utf-8");
    for (const stmt of sql
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean)) {
      sqlite.exec(stmt);
    }
    if (file.startsWith(lastTag)) return;
  }
}

function applyOne(sqlite: Database.Database, tag: string) {
  const dir = path.join(__dirname, "../../drizzle");
  const file = fs.readdirSync(dir).find((f) => f.startsWith(tag))!;
  const sql = fs.readFileSync(path.join(dir, file), "utf-8");
  for (const stmt of sql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean)) {
    sqlite.exec(stmt);
  }
}

describe("refresh token auth-event backfill (0007)", () => {
  function seed() {
    const sqlite = new Database(":memory:");
    applyUpTo(sqlite, "0006");

    sqlite.exec(`INSERT INTO tenants (id, name, created_at, updated_at)
      VALUES ('t1', 'T1', '2026-01-01', '2026-01-01')`);

    // A login session that produced a session, with all the auth-event facts.
    sqlite.exec(`INSERT INTO login_sessions
      (id, tenant_id, session_id, csrf_token, auth_params, auth_connection,
       auth_strategy_strategy, auth_strategy_strategy_type,
       created_at_ts, updated_at_ts, expires_at_ts, state)
      VALUES ('ls-live', 't1', 'sess-1', 'csrf',
        '{"client_id":"c1","organization":"org_42"}', 'google-oauth2',
        'google', 'social', 1, 1, 9999999999, 'completed')`);

    const token = (id: string, loginId: string) =>
      `INSERT INTO refresh_tokens
        (id, tenant_id, client_id, login_id, user_id, resource_servers,
         device, rotating, created_at_ts)
       VALUES ('${id}', 't1', 'c1', '${loginId}', 'u1', '[]', '{}', 0, 1)`;

    // Legacy token whose parent survives — should be backfilled.
    sqlite.exec(token("rt-live", "ls-live"));
    // Legacy token whose parent was cleaned up — must stay null.
    sqlite.exec(token("rt-orphan", "ls-gone"));

    return sqlite;
  }

  it("populates all four facts from the surviving login session", () => {
    const sqlite = seed();
    applyOne(sqlite, "0007");

    const row = sqlite
      .prepare("SELECT * FROM refresh_tokens WHERE id = 'rt-live'")
      .get() as Record<string, unknown>;

    expect(row.session_id).toBe("sess-1");
    expect(row.organization).toBe("org_42");
    expect(row.auth_connection).toBe("google-oauth2");
    expect(row.auth_strategy_strategy).toBe("google");
    expect(row.auth_strategy_strategy_type).toBe("social");
  });

  it("leaves an orphaned token untouched rather than half-populating it", () => {
    const sqlite = seed();
    applyOne(sqlite, "0007");

    const row = sqlite
      .prepare("SELECT * FROM refresh_tokens WHERE id = 'rt-orphan'")
      .get() as Record<string, unknown>;

    // session_id is the marker the refresh grant reads to decide whether to
    // consult the login session. Setting it without the rest would make the
    // grant skip a lookup it still needs, so a token with no resolvable
    // parent must stay entirely null.
    expect(row.session_id).toBeNull();
    expect(row.organization).toBeNull();
    expect(row.auth_connection).toBeNull();
  });

  it("is safe to re-run", () => {
    const sqlite = seed();
    applyOne(sqlite, "0007");
    applyOne(sqlite, "0007");

    const row = sqlite
      .prepare("SELECT * FROM refresh_tokens WHERE id = 'rt-live'")
      .get() as Record<string, unknown>;
    expect(row.session_id).toBe("sess-1");
  });
});
