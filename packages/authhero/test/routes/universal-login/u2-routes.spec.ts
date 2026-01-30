import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getTestServer } from "../../helpers/test-server";
import { getAdminToken } from "../../helpers/token";
import { AuthorizationResponseType } from "@authhero/adapter-interfaces";

describe("u2 routes", () => {
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
      const response = await u2Client.login.identifier.$get({
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

      // Set custom liquid template
      const customTemplate = `<!DOCTYPE html>
<html>
  <head>
    {%- auth0:head -%}
    <style>
      body { background-color: #custom-bg-color; }
      .custom-class { color: red; }
    </style>
  </head>
  <body>
    <div class="custom-wrapper">
      <h1>Custom Login Page</h1>
      {%- auth0:widget -%}
      <footer>Custom Footer Content</footer>
    </div>
  </body>
</html>`;

      const setTemplateResponse =
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
      const response = await u2Client.login.identifier.$get({
        query: { state },
      });

      expect(response.status).toBe(200);
      const html = await response.text();

      // Custom template elements should be present
      expect(html).toContain("custom-wrapper");
      expect(html).toContain("Custom Login Page");
      expect(html).toContain("Custom Footer Content");
      expect(html).toContain("#custom-bg-color");
      expect(html).toContain(".custom-class");

      // auth0:head content should be injected (widget script, styles, etc.)
      expect(html).toContain("/u/widget/authhero-widget.esm.js");
      expect(html).toContain("<meta charset=");

      // auth0:widget content should be injected
      expect(html).toContain("authhero-widget");
      expect(html).toContain('id="widget"');
    });

    it("should revert to default template after deleting custom template", async () => {
      const { u2App, oauthApp, managementApp, env } = await getTestServer({
        mockEmail: true,
      });
      const oauthClient = testClient(oauthApp, env);
      const u2Client = testClient(u2App, env);
      const managementClient = testClient(managementApp, env);
      const token = await getAdminToken();

      // Set custom liquid template
      const customTemplate = `<!DOCTYPE html>
<html>
  <head>{%- auth0:head -%}</head>
  <body>
    <div class="unique-custom-element">UNIQUE_MARKER</div>
    {%- auth0:widget -%}
  </body>
</html>`;

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
      const customResponse = await u2Client.login.identifier.$get({
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
      const defaultResponse = await u2Client.login.identifier.$get({
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
});
