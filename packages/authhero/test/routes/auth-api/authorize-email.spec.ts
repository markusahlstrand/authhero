import { describe, expect, it } from "vitest";
import { testClient } from "hono/testing";
import { AuthorizationResponseType } from "@authhero/adapter-interfaces";
import { getTestServer } from "../../helpers/test-server";
import { u2Screen } from "../../helpers/u2-screen";

describe("authorize with connection=email", () => {
  it.each(["1", "2"])(
    "collects an email without login_hint in universal login v%s",
    async (version) => {
      const { oauthApp, universalApp, u2App, env, getSentEmails } =
        await getTestServer({ mockEmail: true });
      await env.data.clients.update("tenantId", "clientId", {
        client_metadata: { universal_login_version: version },
      });
      await env.data.promptSettings.set("tenantId", {
        identifier_first: false,
        password_first: true,
      });
      await env.data.users.update("tenantId", "email|userId", {
        app_metadata: { strategy: "auth0" },
      });
      await env.data.connections.update("tenantId", "email", {
        options: { authentication_method: "code" },
      });

      const response = await testClient(oauthApp, env).authorize.$get({
        query: {
          client_id: "clientId",
          redirect_uri: "https://example.com/callback",
          response_type: AuthorizationResponseType.CODE,
          connection: "email",
          state: "client-state",
          scope: "openid email",
        },
      });
      expect(response.status).toBe(302);
      const location = new URL(
        response.headers.get("location")!,
        "https://example.com",
      );
      expect(location.pathname).toBe(
        version === "2"
          ? "/u2/login/login-passwordless-identifier"
          : "/u/login/identifier",
      );
      const state = location.searchParams.get("state")!;
      expect(await getSentEmails()).toHaveLength(0);

      const screen =
        version === "2"
          ? u2Screen(u2App, env, "login/login-passwordless-identifier")
          : testClient(universalApp, env).login.identifier;
      const page = await screen.$get({ query: { state } });
      expect(page.status).toBe(200);
      expect(await page.text()).toContain("username");

      const submitted = await screen.$post({
        query: { state },
        form: { username: "foo@example.com" },
      });
      if (version === "2") {
        expect(submitted.status).toBe(200);
        expect(await submitted.text()).toContain("email-otp-challenge");
      } else {
        expect(submitted.status).toBe(302);
        expect(submitted.headers.get("location")).toContain(
          "email-otp-challenge",
        );
      }
      const emails = await getSentEmails();
      expect(emails).toHaveLength(1);
      expect(emails[0]?.data.code).toBeTruthy();
      const session = await env.data.loginSessions.get("tenantId", state);
      expect(session?.authParams.username).toBe("foo@example.com");
      expect(session?.authParams.state).toBe("client-state");
    },
  );

  it.each([true, false])(
    "preserves the password fallback without an email connection (identifier_first=%s)",
    async (identifierFirst) => {
      const { oauthApp, u2App, env, getSentEmails } = await getTestServer({
        mockEmail: true,
      });
      await env.data.clients.update("tenantId", "clientId", {
        client_metadata: { universal_login_version: "2" },
      });
      await env.data.clientConnections.updateByClient("tenantId", "clientId", [
        "Username-Password-Authentication",
      ]);
      await env.data.promptSettings.set("tenantId", {
        identifier_first: identifierFirst,
        password_first: true,
      });

      const response = await testClient(oauthApp, env).authorize.$get({
        query: {
          client_id: "clientId",
          redirect_uri: "https://example.com/callback",
          response_type: AuthorizationResponseType.CODE,
          connection: "email",
        },
      });
      expect(response.status).toBe(302);
      const location = new URL(
        response.headers.get("location")!,
        "https://example.com",
      );
      const screenPath = identifierFirst ? "login/identifier" : "login";
      expect(location.pathname).toBe(`/u2/${screenPath}`);
      const state = location.searchParams.get("state")!;
      const screen = u2Screen(u2App, env, screenPath);
      const page = await screen.$get({ query: { state } });
      expect(page.status).toBe(200);
      if (identifierFirst) {
        const submitted = await screen.$post({
          query: { state },
          form: { username: "foo@example.com" },
        });
        expect(submitted.status).toBe(200);
        expect(await submitted.text()).toContain("enter-password");
      } else {
        expect(await page.text()).toContain('"type":"PASSWORD"');
      }
      expect(await getSentEmails()).toHaveLength(0);
    },
  );

  it("still sends a code immediately when login_hint is supplied", async () => {
    const { oauthApp, env, getSentEmails } = await getTestServer({
      mockEmail: true,
    });
    const response = await testClient(oauthApp, env).authorize.$get({
      query: {
        client_id: "clientId",
        redirect_uri: "https://example.com/callback",
        response_type: AuthorizationResponseType.CODE,
        connection: "email",
        login_hint: "foo@example.com",
      },
    });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain("email-otp-challenge");
    expect(await getSentEmails()).toHaveLength(1);
  });
});
