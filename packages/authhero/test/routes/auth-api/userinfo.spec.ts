import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getTestServer } from "../../helpers/test-server";
import { createToken } from "../../helpers/token";

describe("userinfo", () => {
  it("should return a user info for the current user", async () => {
    const { oauthApp, env } = await getTestServer();
    const client = testClient(oauthApp, env);

    const accessToken = await createToken({
      userId: "email|userId",
      tenantId: "tenantId",
      scope: "openid",
    });

    const response = await client.userinfo.$get(
      {},
      {
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      },
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body).toEqual({
      email: "foo@example.com",
      email_verified: true,
      sub: "email|userId",
    });
  });

  it("should a 403 if there is no bearer", async () => {
    const { oauthApp, env } = await getTestServer();
    const client = testClient(oauthApp, env);

    const response = await client.userinfo.$get({});

    expect(response.status).toBe(401);
  });

  it("should a 403 if there is no openid scope", async () => {
    const { oauthApp, env } = await getTestServer();
    const client = testClient(oauthApp, env);
    const accessToken = await createToken({
      userId: "email|userId",
      tenantId: "tenantId",
      scope: "",
    });

    const response = await client.userinfo.$get(
      {},
      {
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      },
    );

    expect(response.status).toBe(403);
  });
});
