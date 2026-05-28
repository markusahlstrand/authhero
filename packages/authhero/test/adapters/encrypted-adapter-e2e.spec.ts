import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getTestServer } from "../helpers/test-server";

interface TokenResponse {
  access_token: string;
  token_type?: string;
}

// These exercise the full auth server with the encrypted data adapter
// installed. The client fixture's client_secret is stored encrypted at rest;
// the token endpoint must decrypt it on the hot path for authentication to
// succeed. This is the path that "must not fail".
describe("encrypted adapter — auth flow e2e", () => {
  it("authenticates a client_credentials grant when secrets are encrypted at rest", async () => {
    const { oauthApp, env } = await getTestServer({ encryption: true });
    const client = testClient(oauthApp, env);

    const response = await client.oauth.token.$post(
      // @ts-expect-error - testClient type requires both form and json
      {
        form: {
          grant_type: "client_credentials",
          client_id: "clientId",
          client_secret: "clientSecret",
          audience: "https://example.com",
        },
      },
      { headers: { "tenant-id": "tenantId" } },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as TokenResponse;
    expect(body.access_token).toBeTruthy();
  });

  it("rejects a wrong client_secret under encryption", async () => {
    const { oauthApp, env } = await getTestServer({ encryption: true });
    const client = testClient(oauthApp, env);

    const response = await client.oauth.token.$post(
      // @ts-expect-error - testClient type requires both form and json
      {
        form: {
          grant_type: "client_credentials",
          client_id: "clientId",
          client_secret: "wrong-secret",
          audience: "https://example.com",
        },
      },
      { headers: { "tenant-id": "tenantId" } },
    );

    // A wrong secret must be rejected — proving the stored ciphertext is
    // actually decrypted and compared, not bypassed.
    expect(response.status).toBe(403);
  });

  it("returns the decrypted client_secret through the management API", async () => {
    const { managementApp, env } = await getTestServer({ encryption: true });
    const { getAdminToken } = await import("../helpers/token");
    const token = await getAdminToken();
    const client = testClient(managementApp, env);

    const response = await client.clients[":id"].$get(
      {
        param: { id: "clientId" },
        header: { "tenant-id": "tenantId" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { client_secret?: string };
    expect(body.client_secret).toBe("clientSecret");
  });
});
