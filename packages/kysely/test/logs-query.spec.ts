import { describe, it, expect, beforeEach } from "vitest";
import { getTestServer } from "./helpers/test-server";

describe("logs list query robustness", () => {
  let data: Awaited<ReturnType<typeof getTestServer>>["data"];
  const tenantId = "test-tenant";

  beforeEach(async () => {
    const res = await getTestServer();
    data = res.data;
    await data.logs.create(tenantId, {
      type: "s",
      description: "email-code login",
      user_id: "auth0|abc-123",
      ip: "1.2.3.4",
      date: new Date().toISOString(),
    });
    // A failed login before any user record exists: email only in description.
    await data.logs.create(tenantId, {
      type: "f",
      description: "Login failed for foo@example.com",
      ip: "5.6.7.8",
      date: new Date().toISOString(),
    });
  });

  async function run(q: string) {
    const r = await data.logs.list(tenantId, { q, include_totals: true });
    return r.logs.length;
  }

  it("does not crash on a free-text term containing a colon", async () => {
    await expect(run("2024-01-01T10:00:00")).resolves.toBeTypeOf("number");
  });

  it("does not crash on a clause referencing a non-column (success)", async () => {
    await expect(run('success:"true"')).resolves.toBeTypeOf("number");
  });

  it("matches a dash-containing field value (admin-escaped)", async () => {
    // exactly what apps/admin escapeLuceneValue produces: dash -> \-
    expect(await run('user_id:"auth0|abc\\-123"')).toBe(1);
    expect(await run('description:"email\\-code"')).toBe(1);
  });

  it("still applies a legitimate allowed field filter", async () => {
    expect(await run('user_id:"auth0|abc-123"')).toBe(1);
    expect(await run('user_id:"nobody"')).toBe(0);
  });

  it("free-text search matches an email in the description (no user_id yet)", async () => {
    expect(await run("foo@example.com")).toBe(1);
  });
});
