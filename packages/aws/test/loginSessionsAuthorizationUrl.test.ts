import { afterEach, describe, expect, it } from "vitest";
import { getTestServer, teardownTestServer } from "./helpers/test-server";

describe("login session authorization URL", () => {
  afterEach(async () => {
    await teardownTestServer();
  });

  it("preserves a long URL", async () => {
    const { data } = await getTestServer();
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
  });
});
