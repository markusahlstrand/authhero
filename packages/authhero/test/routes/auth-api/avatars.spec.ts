import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getTestServer } from "../../helpers/test-server";
import { createToken } from "../../helpers/token";

describe("avatars", () => {
  describe("GET /avatars/:initials", () => {
    it("returns an SVG with the requested initials and color", async () => {
      const { oauthApp, env } = await getTestServer();

      const response = await oauthApp.request(
        "/avatars/TU.svg?bg=1F77B4",
        {},
        env,
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("image/svg+xml");
      expect(response.headers.get("cache-control")).toContain("max-age");
      const svg = await response.text();
      expect(svg).toContain("<svg");
      expect(svg).toContain('fill="#1F77B4"');
      expect(svg).toContain(">TU<");
    });

    it("ignores an invalid bg and uses a neutral color", async () => {
      const { oauthApp, env } = await getTestServer();

      const response = await oauthApp.request(
        "/avatars/AB.svg?bg=not-a-color",
        {},
        env,
      );

      expect(response.status).toBe(200);
      const svg = await response.text();
      expect(svg).toContain('fill="#7F7F7F"');
    });
  });

  describe("/userinfo picture", () => {
    it("returns the user's own picture when set", async () => {
      const { oauthApp, env } = await getTestServer();
      const client = testClient(oauthApp, env);

      const accessToken = await createToken({
        user_id: "email|userId",
        tenant_id: "tenantId",
        scope: "openid profile",
      });

      const response = await client.userinfo.$get(
        {},
        { headers: { authorization: `Bearer ${accessToken}` } },
      );

      const body = await response.json();
      expect(body.picture).toBe("https://example.com/test.png");
    });

    it("generates a default avatar URL when the user has no picture", async () => {
      const { oauthApp, env } = await getTestServer();
      const client = testClient(oauthApp, env);

      await env.data.users.create("tenantId", {
        email: "nopic@example.com",
        email_verified: true,
        name: "No Picture",
        connection: "email",
        provider: "email",
        is_social: false,
        user_id: "email|nopic",
      });

      const accessToken = await createToken({
        user_id: "email|nopic",
        tenant_id: "tenantId",
        scope: "openid profile",
      });

      const response = await client.userinfo.$get(
        {},
        { headers: { authorization: `Bearer ${accessToken}` } },
      );

      const body = await response.json();
      // ISSUER in the test server is http://localhost:3000/
      expect(body.picture).toMatch(
        /^http:\/\/localhost:3000\/avatars\/NP\.svg\?bg=[0-9A-F]{6}$/,
      );
    });

    it("omits picture entirely without the profile scope", async () => {
      const { oauthApp, env } = await getTestServer();
      const client = testClient(oauthApp, env);

      const accessToken = await createToken({
        user_id: "email|userId",
        tenant_id: "tenantId",
        scope: "openid email",
      });

      const response = await client.userinfo.$get(
        {},
        { headers: { authorization: `Bearer ${accessToken}` } },
      );

      const body = await response.json();
      expect(body.picture).toBeUndefined();
    });
  });
});
