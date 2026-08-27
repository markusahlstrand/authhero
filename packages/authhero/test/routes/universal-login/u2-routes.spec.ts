import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getTestServer } from "../../helpers/test-server";
import { getAdminToken } from "../../helpers/token";
import { createSessions } from "../../helpers/create-session";
import { AuthorizationResponseType } from "@authhero/adapter-interfaces";

import { u2Screen } from "../../helpers/u2-screen";
describe("u2 routes", () => {
  describe("info landing page", () => {
    it("rejects an unknown auth code without leaking it", async () => {
      const { u2App, env } = await getTestServer({ mockEmail: true });

      const response = await u2App.request(
        "http://localhost/info?state=1234&code=abc123",
        { method: "GET" },
        env,
      );

      expect(response.status).toBe(400);
      const html = await response.text();
      expect(html).toContain("Sign-in failed");
      expect(html).toContain(
        "The authorization code is invalid, expired or has already been used.",
      );
      expect(html).not.toContain("abc123");
    });

    it("renders a plain signed-in page when no code is present", async () => {
      const { u2App, env } = await getTestServer({ mockEmail: true });

      const response = await u2App.request(
        "http://localhost/info?state=1234",
        { method: "GET" },
        env,
      );

      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Signed in");
      expect(html).toContain("You have signed in successfully.");
    });

    async function seedInfoPageCode(
      env: Awaited<ReturnType<typeof getTestServer>>["env"],
      redirectUri: string,
      codeId: string,
    ) {
      const { loginSession } = await createSessions(env.data);
      await env.data.loginSessions.update("tenantId", loginSession.id, {
        authParams: {
          ...loginSession.authParams,
          redirect_uri: redirectUri,
          scope: "openid profile email",
          state: "1234",
        },
      });
      await env.data.codes.create("tenantId", {
        code_type: "authorization_code",
        user_id: "email|userId",
        code_id: codeId,
        login_id: loginSession.id,
        redirect_uri: redirectUri,
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      });
      return loginSession;
    }

    it("exchanges a code issued for the info page and shows the tokens", async () => {
      const { u2App, env } = await getTestServer({ mockEmail: true });
      await seedInfoPageCode(env, "http://localhost/info", "info-page-code");

      const response = await u2App.request(
        "http://localhost/info?state=1234&code=info-page-code",
        { method: "GET" },
        env,
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      const html = await response.text();
      expect(html).toContain("Signed in");
      expect(html).toContain("Copy id token");
      expect(html).toContain("Copy access token");
      // Claims grid shows the ID token payload.
      expect(html).toContain("email|userId");
      expect(html).toMatch(/data-copy-token="[^"]+\.[^"]+\.[^"]+"/);
      expect(html).not.toContain("info-page-code");

      // The code is single-use: it's consumed by the exchange.
      const code = await env.data.codes.get(
        "tenantId",
        "info-page-code",
        "authorization_code",
      );
      expect(code?.used_at).toBeTruthy();

      const replay = await u2App.request(
        "http://localhost/info?state=1234&code=info-page-code",
        { method: "GET" },
        env,
      );
      expect(replay.status).toBe(400);
      expect(await replay.text()).toContain("Sign-in failed");
    });

    it("refuses a code whose redirect_uri only differs in scheme", async () => {
      const { u2App, env } = await getTestServer({ mockEmail: true });
      // Test issuer and request are both plain http; an https twin of the
      // same host/path must not qualify (nor an http twin of an https page).
      await seedInfoPageCode(env, "https://localhost/info", "scheme-code");

      const response = await u2App.request(
        "http://localhost/info?state=1234&code=scheme-code",
        { method: "GET" },
        env,
      );

      expect(response.status).toBe(400);
      expect(await response.text()).toContain("was not issued for this page");
      const code = await env.data.codes.get(
        "tenantId",
        "scheme-code",
        "authorization_code",
      );
      expect(code?.used_at).toBeFalsy();
    });

    it("refuses to exchange a code that was issued for another redirect_uri", async () => {
      const { u2App, env } = await getTestServer({ mockEmail: true });
      await seedInfoPageCode(
        env,
        "https://example.com/callback",
        "stolen-code",
      );

      const response = await u2App.request(
        "http://localhost/info?state=1234&code=stolen-code",
        { method: "GET" },
        env,
      );

      expect(response.status).toBe(400);
      const html = await response.text();
      expect(html).toContain("was not issued for this page");
      expect(html).not.toContain("Copy access token");

      // A rejected code must remain redeemable at the real redirect target.
      const code = await env.data.codes.get(
        "tenantId",
        "stolen-code",
        "authorization_code",
      );
      expect(code?.used_at).toBeFalsy();
    });

    it("renders an error page when the redirect carries an OAuth error", async () => {
      const { u2App, env } = await getTestServer({ mockEmail: true });

      const response = await u2App.request(
        "http://localhost/info?state=1234&error=access_denied&error_description=Login%20session%20closed",
        { method: "GET" },
        env,
      );

      expect(response.status).toBe(400);
      const html = await response.text();
      expect(html).toContain("Login session closed");
    });
  });

  describe("liquid template rendering", () => {
    it("should render identifier page with default template", async () => {
      const { u2App, oauthApp, env } = await getTestServer({
        mockEmail: true,
      });
      const oauthClient = testClient(oauthApp, env);
      const u2Client = testClient(u2App, env);

      // Start OAuth authorization flow
      const authorizeResponse = await oauthClient.authorize.$get({
        query: {
          client_id: "clientId",
          redirect_uri: "https://example.com/callback",
          state: "state",
          nonce: "nonce",
          scope: "openid email profile",
          response_type: AuthorizationResponseType.CODE,
        },
      });

      expect(authorizeResponse.status).toBe(302);

      const location = authorizeResponse.headers.get("location");
      const universalUrl = new URL(`https://example.com${location}`);
      const state = universalUrl.searchParams.get("state");
      if (!state) {
        throw new Error("No state found");
      }

      // GET u2 identifier page
      const response = await u2Screen(u2App, env, "login/identifier").$get({
        query: { state },
      });

      expect(response.status).toBe(200);
      const html = await response.text();

      // Default template should include standard HTML structure
      expect(html).toContain("<html");
      expect(html).toContain("<head");
      expect(html).toContain("<body");
      expect(html).toContain("authhero-widget");
      expect(html).toContain("/u/widget/authhero-widget.esm.js");
    });

    it("should render identifier page with custom liquid template", async () => {
      const { u2App, oauthApp, managementApp, env } = await getTestServer({
        mockEmail: true,
      });
      const oauthClient = testClient(oauthApp, env);
      const u2Client = testClient(u2App, env);
      const managementClient = testClient(managementApp, env);
      const token = await getAdminToken();

      // Custom body template — only the widget mount + selected chip slots.
      // The page shell (html/head/body styles, dark-mode runtime) is fixed.
      const customTemplate = `<div class="custom-wrapper">
  <h1>Custom Login Page</h1>
  {%- auth0:widget -%}
  {%- authhero:settings -%}
  {%- authhero:legal -%}
  <footer>Custom Footer Content</footer>
</div>`;

      const setTemplateResponse = await managementClient.branding.templates[
        "universal-login"
      ].$put(
        {
          header: {
            "tenant-id": "tenantId",
          },
          json: {
            body: customTemplate,
          },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      expect([201, 204]).toContain(setTemplateResponse.status);

      // Start OAuth authorization flow
      const authorizeResponse = await oauthClient.authorize.$get({
        query: {
          client_id: "clientId",
          redirect_uri: "https://example.com/callback",
          state: "state",
          nonce: "nonce",
          scope: "openid email profile",
          response_type: AuthorizationResponseType.CODE,
        },
      });

      expect(authorizeResponse.status).toBe(302);

      const location = authorizeResponse.headers.get("location");
      const universalUrl = new URL(`https://example.com${location}`);
      const state = universalUrl.searchParams.get("state");
      if (!state) {
        throw new Error("No state found");
      }

      // GET u2 identifier page
      const response = await u2Screen(u2App, env, "login/identifier").$get({
        query: { state },
      });

      expect(response.status).toBe(200);
      const html = await response.text();

      // Custom template body should be inserted into the AuthHero shell
      expect(html).toContain("custom-wrapper");
      expect(html).toContain("Custom Login Page");
      expect(html).toContain("Custom Footer Content");

      // Shell still provides head plumbing
      expect(html).toContain("/u/widget/authhero-widget.esm.js");
      expect(html).toContain("<meta charSet=");

      // auth0:widget slot expanded into the widget mount
      expect(html).toContain("authhero-widget");
      expect(html).toContain("data-authhero-widget-container");

      // Slots present in the custom template render their chip element
      // (the class name also appears in the page CSS, so match the element).
      expect(html).toMatch(/<div class="ah-chip ah-chip-settings\b/);

      // The powered-by slot was omitted, so no trust-chip element renders
      expect(html).not.toMatch(/<div class="ah-chip ah-chip-trust\b/);
    });

    it("should revert to default template after deleting custom template", async () => {
      const { u2App, oauthApp, managementApp, env } = await getTestServer({
        mockEmail: true,
      });
      const oauthClient = testClient(oauthApp, env);
      const u2Client = testClient(u2App, env);
      const managementClient = testClient(managementApp, env);
      const token = await getAdminToken();

      // Set custom body template — slot-based.
      const customTemplate = `<div class="unique-custom-element">UNIQUE_MARKER</div>
{%- auth0:widget -%}`;

      await managementClient.branding.templates["universal-login"].$put(
        {
          header: {
            "tenant-id": "tenantId",
          },
          json: {
            body: customTemplate,
          },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      // Start OAuth authorization flow
      const authorizeResponse = await oauthClient.authorize.$get({
        query: {
          client_id: "clientId",
          redirect_uri: "https://example.com/callback",
          state: "state",
          nonce: "nonce",
          scope: "openid email profile",
          response_type: AuthorizationResponseType.CODE,
        },
      });

      const location = authorizeResponse.headers.get("location");
      const universalUrl = new URL(`https://example.com${location}`);
      const state = universalUrl.searchParams.get("state");
      if (!state) {
        throw new Error("No state found");
      }

      // Verify custom template is applied
      const customResponse = await u2Screen(
        u2App,
        env,
        "login/identifier",
      ).$get({
        query: { state },
      });
      const customHtml = await customResponse.text();
      expect(customHtml).toContain("UNIQUE_MARKER");
      expect(customHtml).toContain("unique-custom-element");

      // Delete the custom template
      await managementClient.branding.templates["universal-login"].$delete(
        {
          header: {
            "tenant-id": "tenantId",
          },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      // Start new OAuth authorization flow
      const authorizeResponse2 = await oauthClient.authorize.$get({
        query: {
          client_id: "clientId",
          redirect_uri: "https://example.com/callback",
          state: "state2",
          nonce: "nonce2",
          scope: "openid email profile",
          response_type: AuthorizationResponseType.CODE,
        },
      });

      const location2 = authorizeResponse2.headers.get("location");
      const universalUrl2 = new URL(`https://example.com${location2}`);
      const state2 = universalUrl2.searchParams.get("state");
      if (!state2) {
        throw new Error("No state found");
      }

      // Verify default template is now used
      const defaultResponse = await u2Screen(
        u2App,
        env,
        "login/identifier",
      ).$get({
        query: { state: state2 },
      });
      const defaultHtml = await defaultResponse.text();

      // Custom elements should NOT be present
      expect(defaultHtml).not.toContain("UNIQUE_MARKER");
      expect(defaultHtml).not.toContain("unique-custom-element");

      // Standard elements should still be present
      expect(defaultHtml).toContain("authhero-widget");
      expect(defaultHtml).toContain("/u/widget/authhero-widget.esm.js");
    });
  });

  describe("tenant enabled_locales", () => {
    type TestServer = Awaited<ReturnType<typeof getTestServer>>;

    async function startLogin(
      oauthApp: TestServer["oauthApp"],
      env: TestServer["env"],
    ) {
      const oauthClient = testClient(oauthApp, env);
      const authorizeResponse = await oauthClient.authorize.$get({
        query: {
          client_id: "clientId",
          redirect_uri: "https://example.com/callback",
          state: "state",
          nonce: "nonce",
          scope: "openid email profile",
          response_type: AuthorizationResponseType.CODE,
        },
      });
      expect(authorizeResponse.status).toBe(302);
      const location = authorizeResponse.headers.get("location");
      const state = new URL(`https://example.com${location}`).searchParams.get(
        "state",
      );
      if (!state) {
        throw new Error("No state found");
      }
      return state;
    }

    it("renders the tenant's only enabled locale even for an English browser", async () => {
      const { u2App, oauthApp, env } = await getTestServer({
        mockEmail: true,
      });
      await env.data.tenants.update("tenantId", {
        enabled_locales: ["nb"],
      });

      const state = await startLogin(oauthApp, env);

      const response = await u2Screen(u2App, env, "login/identifier").$get({
        query: { state },
        header: { "Accept-Language": "en-US,en;q=0.9" },
      });

      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain('lang="nb"');
    });

    it("still honours ui_locales when it names an enabled locale", async () => {
      const { u2App, oauthApp, env } = await getTestServer({
        mockEmail: true,
      });
      await env.data.tenants.update("tenantId", {
        enabled_locales: ["nb", "sv"],
      });

      const state = await startLogin(oauthApp, env);

      const response = await u2Screen(u2App, env, "login/identifier").$get({
        query: { state, ui_locales: "sv" },
        header: { "Accept-Language": "en-US,en;q=0.9" },
      });

      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain('lang="sv"');
    });

    it("keeps browser language detection when no enabled_locales are set", async () => {
      const { u2App, oauthApp, env } = await getTestServer({
        mockEmail: true,
      });

      const state = await startLogin(oauthApp, env);

      const response = await u2Screen(u2App, env, "login/identifier").$get({
        query: { state },
        header: { "Accept-Language": "sv,en;q=0.8" },
      });

      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain('lang="sv"');
    });
  });
});
