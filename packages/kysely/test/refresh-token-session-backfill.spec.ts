import { describe, expect, it, vi } from "vitest";
import { getTestServer } from "./helpers/test-server";
import { up } from "../migrate/migrations/2026-08-21T12:00:00_refresh_token_session_id_backfill";

/**
 * The migration runs (as a no-op) on every migrateToLatest, so these tests
 * drive `up` directly against an already-migrated database to exercise the
 * branches a zero-row chain run never reaches.
 */

/**
 * SQLite enforces the inlined foreign keys, so the parent rows have to exist
 * before a login session or refresh token can be inserted.
 */
async function setup() {
  const { data, db } = await getTestServer();

  await data.tenants.create({
    id: "tenantId",
    friendly_name: "Test Tenant",
    audience: "https://example.com",
    sender_email: "login@example.com",
    sender_name: "SenderName",
  });
  await data.clients.create("tenantId", {
    client_id: "clientId",
    client_secret: "clientSecret",
    name: "Test Client",
    callbacks: [],
    allowed_logout_urls: [],
    web_origins: [],
  });
  await db
    .insertInto("sessions")
    .values({
      id: "sess1",
      tenant_id: "tenantId",
      user_id: null,
      device: "{}",
      clients: "[]",
      expires_at_ts: Date.now() + 86_400_000,
    })
    .execute();

  return db;
}

// Insert straight through kysely: the adapter's create() populates the very
// columns the backfill exists to fill, which would defeat the test.
async function seedToken(
  db: any,
  id: string,
  loginId: string,
  tenantId = "tenantId",
) {
  await db
    .insertInto("refresh_tokens")
    .values({
      id,
      tenant_id: tenantId,
      client_id: "clientId",
      user_id: null,
      login_id: loginId,
      resource_servers: "[]",
      device: "{}",
      rotating: 0,
      expires_at_ts: Date.now() + 86_400_000,
      session_id: null,
    })
    .execute();
}

async function seedLoginSession(
  db: any,
  id: string,
  sessionId: string | null,
  authParams: string | null,
  tenantId = "tenantId",
) {
  await db
    .insertInto("login_sessions")
    .values({
      id,
      tenant_id: tenantId,
      session_id: sessionId,
      auth_connection: "google-oauth2",
      auth_strategy_strategy: "google-oauth2",
      auth_strategy_strategy_type: "social",
      auth_params: authParams,
      expires_at_ts: Date.now() + 86_400_000,
    })
    .execute();
}

describe("refresh_tokens session_id backfill migration", () => {
  it("copies all five facts from the parent login session", async () => {
    const db = await setup();

    await seedLoginSession(db, "ls1", "sess1", '{"organization":"org_1"}');
    await seedToken(db, "rt1", "ls1");

    await up(db);

    const row = await db
      .selectFrom("refresh_tokens")
      .selectAll()
      .where("id", "=", "rt1")
      .executeTakeFirst();

    expect(row.session_id).toBe("sess1");
    expect(row.organization).toBe("org_1");
    expect(row.auth_connection).toBe("google-oauth2");
    expect(row.auth_strategy_strategy).toBe("google-oauth2");
    expect(row.auth_strategy_strategy_type).toBe("social");
  });

  it("keeps the other four facts when auth_params is unparseable", async () => {
    const db = await setup();

    await seedLoginSession(db, "ls1", "sess1", "not-json{{");
    await seedToken(db, "rt1", "ls1");

    await up(db);

    const row = await db
      .selectFrom("refresh_tokens")
      .selectAll()
      .where("id", "=", "rt1")
      .executeTakeFirst();

    // The marker and the connection survive; only the organization is lost.
    expect(row.session_id).toBe("sess1");
    expect(row.organization).toBeNull();
    expect(row.auth_connection).toBe("google-oauth2");
  });

  it("leaves a token whose parent has no session_id untouched", async () => {
    const db = await setup();

    await seedLoginSession(db, "ls1", null, '{"organization":"org_1"}');
    await seedToken(db, "rt1", "ls1");

    await up(db);

    const row = await db
      .selectFrom("refresh_tokens")
      .selectAll()
      .where("id", "=", "rt1")
      .executeTakeFirst();

    // The marker must never run ahead of the data.
    expect(row.session_id).toBeNull();
    expect(row.auth_connection).toBeNull();
  });

  it("leaves an orphaned token untouched", async () => {
    const db = await setup();

    await seedToken(db, "rt1", "ls_gone");

    await up(db);

    const row = await db
      .selectFrom("refresh_tokens")
      .selectAll()
      .where("id", "=", "rt1")
      .executeTakeFirst();

    expect(row.session_id).toBeNull();
  });

  it("declines the work above the in-process threshold", async () => {
    const db = await setup();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await seedLoginSession(db, "ls1", "sess1", '{"organization":"org_1"}');
    for (let i = 0; i < 501; i++) {
      await seedToken(db, `rt${i}`, "ls1");
    }

    await up(db);

    // Nothing written, and the operator is told where the bulk path is.
    const backfilled = await db
      .selectFrom("refresh_tokens")
      .select((eb) => eb.fn.countAll().as("count"))
      .where("session_id", "is not", null)
      .executeTakeFirst();
    expect(Number(backfilled.count)).toBe(0);

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("refresh-token-session-id-backfill.sql"),
    );
    warn.mockRestore();
  });

  it("is idempotent", async () => {
    const db = await setup();

    await seedLoginSession(db, "ls1", "sess1", '{"organization":"org_1"}');
    await seedToken(db, "rt1", "ls1");

    await up(db);
    await up(db);

    const row = await db
      .selectFrom("refresh_tokens")
      .selectAll()
      .where("id", "=", "rt1")
      .executeTakeFirst();

    expect(row.session_id).toBe("sess1");
    expect(row.organization).toBe("org_1");
  });
});
