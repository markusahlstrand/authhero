import { describe, expect, it } from "vitest";
import { getTestServer } from "../helpers/test-server";

describe("login session authorization URL", () => {
  it("preserves long URLs on create and update", async () => {
    const { data } = getTestServer();
    await data.tenants.create({ id: "tenantId", name: "Test Tenant" });

    const url = `https://login.example.com/authorize?long=${"x".repeat(1100)}&utm_source=newsletter`;
    const session = await data.loginSessions.create("tenantId", {
      csrf_token: "csrf",
      authParams: { client_id: "clientId" },
      expires_at: new Date(Date.now() + 600_000).toISOString(),
      authorization_url: url,
    });

    expect(session.authorization_url).toBe(url);
    expect(
      (await data.loginSessions.get("tenantId", session.id))?.authorization_url,
    ).toBe(url);

    const updatedUrl = `${url}&utm_campaign=fall`;
    await data.loginSessions.update("tenantId", session.id, {
      authorization_url: updatedUrl,
    });
    expect(
      (await data.loginSessions.get("tenantId", session.id))?.authorization_url,
    ).toBe(updatedUrl);
  });
});
