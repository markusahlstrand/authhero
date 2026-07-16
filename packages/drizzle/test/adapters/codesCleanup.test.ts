import { describe, expect, it } from "vitest";
import { getTestServer } from "../helpers/test-server";

const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

const DAY = 1000 * 60 * 60 * 24;

type TestData = ReturnType<typeof getTestServer>["data"];

async function setupTenant(data: TestData, id: string) {
  await data.tenants.create({
    id,
    friendly_name: "Test Tenant",
    audience: "https://example.com",
    sender_email: "login@example.com",
    sender_name: "SenderName",
  });
}

describe("codes cleanup", () => {
  it("deletes codes expired before the cutoff and keeps the rest", async () => {
    const { data } = getTestServer();
    await setupTenant(data, "tenantId");

    await data.codes.create("tenantId", {
      code_id: "long-expired",
      code_type: "authorization_code",
      login_id: "login1",
      expires_at: iso(-2 * DAY),
    });

    // Expired only an hour ago — inside the grace window, must survive.
    await data.codes.create("tenantId", {
      code_id: "recently-expired",
      code_type: "authorization_code",
      login_id: "login2",
      expires_at: iso(-1000 * 60 * 60),
    });

    await data.codes.create("tenantId", {
      code_id: "live",
      code_type: "authorization_code",
      login_id: "login3",
      expires_at: iso(1000 * 60 * 60),
    });

    const deleted = await data.codes.cleanup(iso(-DAY));

    expect(deleted).toEqual(1);

    const { codes } = await data.codes.list("tenantId", {});
    expect(codes.map((c) => c.code_id).sort()).toEqual([
      "live",
      "recently-expired",
    ]);
  });

  it("sweeps across tenants, since retention is not tenant-scoped", async () => {
    const { data } = getTestServer();
    await setupTenant(data, "tenant1");
    await setupTenant(data, "tenant2");

    for (const tenant of ["tenant1", "tenant2"]) {
      await data.codes.create(tenant, {
        code_id: `expired-${tenant}`,
        code_type: "otp",
        login_id: "login1",
        expires_at: iso(-2 * DAY),
      });
    }

    const deleted = await data.codes.cleanup(iso(-DAY));

    expect(deleted).toEqual(2);
    expect((await data.codes.list("tenant1", {})).codes).toEqual([]);
    expect((await data.codes.list("tenant2", {})).codes).toEqual([]);
  });

  it("sweeps a backlog larger than one chunk", async () => {
    const { data } = getTestServer();
    await setupTenant(data, "tenantId");

    // CLEANUP_CHUNK is 500, so this spans three statements (500/500/201) and
    // catches a loop that stops after the first chunk or fails to terminate.
    const TOTAL = 1201;
    for (let i = 0; i < TOTAL; i++) {
      await data.codes.create("tenantId", {
        code_id: `expired-${i}`,
        code_type: "authorization_code",
        login_id: "login1",
        expires_at: iso(-2 * DAY),
      });
    }
    // One live row that must survive the whole loop.
    await data.codes.create("tenantId", {
      code_id: "live",
      code_type: "authorization_code",
      login_id: "login1",
      expires_at: iso(1000 * 60 * 60),
    });

    const deleted = await data.codes.cleanup(iso(-DAY));

    expect(deleted).toEqual(TOTAL);
    const { codes } = await data.codes.list("tenantId", {});
    expect(codes.map((c) => c.code_id)).toEqual(["live"]);
  });

  it("returns 0 when there is nothing to sweep", async () => {
    const { data } = getTestServer();
    await setupTenant(data, "tenantId");

    await data.codes.create("tenantId", {
      code_id: "live",
      code_type: "authorization_code",
      login_id: "login1",
      expires_at: iso(1000 * 60 * 60),
    });

    expect(await data.codes.cleanup(iso(-DAY))).toEqual(0);
  });
});
