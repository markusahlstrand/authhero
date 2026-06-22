import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getAdminToken } from "../../helpers/token";
import { getTestServer } from "../../helpers/test-server";
import { DEFAULT_BRANDING } from "../../../src/constants/defaultBranding";

describe("branding", () => {
  it("should set and get branding", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);

    const token = await getAdminToken();
    const emptyBrandingResponse = await managementClient.branding.$get(
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
    expect(emptyBrandingResponse.status).toBe(200);
    const emptyBranding = await emptyBrandingResponse.json();

    expect(emptyBranding).toEqual(DEFAULT_BRANDING);

    const brandingData = {
      font: { url: "https://example.com/font" },
      colors: {
        primary: "#123456",
        page_background: {
          type: "type",
          start: "start",
          end: "end",
          angle_deg: 180,
        },
      },
      logo_url: "https://example.com/logo",
      favicon_url: "https://example.com/favicon",
    };

    // Update the branding
    const updateBrandingResponse = await managementClient.branding.$patch(
      {
        header: {
          "tenant-id": "tenantId",
        },
        json: brandingData,
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );

    expect(updateBrandingResponse.status).toBe(200);

    // Get the updated branding
    const brandingResponse = await managementClient.branding.$get(
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
    expect(brandingResponse.status).toBe(200);
    const brandingResponseBody = await brandingResponse.json();

    expect(brandingResponseBody).toEqual(brandingData);
  });

  describe("universal login templates", () => {
    it("should return the AuthHero default template when no custom template exists", async () => {
      const { managementApp, env } = await getTestServer();
      const managementClient = testClient(managementApp, env);
      const token = await getAdminToken();

      const response = await managementClient.branding.templates[
        "universal-login"
      ].$get(
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

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.body).toContain("{%- auth0:widget -%}");
    });

    it("should set and get universal login template", async () => {
      const { managementApp, env } = await getTestServer();
      const managementClient = testClient(managementApp, env);
      const token = await getAdminToken();

      const template = {
        body: "<!DOCTYPE html><html><head>{%- auth0:head -%}</head><body>{%- auth0:widget -%}</body></html>",
      };

      // Set the template
      const setResponse = await managementClient.branding.templates[
        "universal-login"
      ].$put(
        {
          header: {
            "tenant-id": "tenantId",
          },
          json: template,
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      expect(setResponse.status).toBe(204);

      // Get the template
      const getResponse = await managementClient.branding.templates[
        "universal-login"
      ].$get(
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

      expect(getResponse.status).toBe(200);
      const responseBody = await getResponse.json();
      expect(responseBody.body).toBe(template.body);
    });

    it("should return 400 when template is missing auth0:widget tag", async () => {
      const { managementApp, env } = await getTestServer();
      const managementClient = testClient(managementApp, env);
      const token = await getAdminToken();

      const template = {
        body: "<body></body>",
      };

      const response = await managementClient.branding.templates[
        "universal-login"
      ].$put(
        {
          header: {
            "tenant-id": "tenantId",
          },
          json: template,
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      expect(response.status).toBe(400);
    });

    it("should delete universal login template", async () => {
      const { managementApp, env } = await getTestServer();
      const managementClient = testClient(managementApp, env);
      const token = await getAdminToken();

      const template = {
        body: "<!DOCTYPE html><html><head>{%- auth0:head -%}</head><body>{%- auth0:widget -%}</body></html>",
      };

      // First set a template
      await managementClient.branding.templates["universal-login"].$put(
        {
          header: {
            "tenant-id": "tenantId",
          },
          json: template,
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      // Delete the template
      const deleteResponse = await managementClient.branding.templates[
        "universal-login"
      ].$delete(
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

      expect(deleteResponse.status).toBe(204);

      // After deletion the GET falls back to the AuthHero default template.
      const getResponse = await managementClient.branding.templates[
        "universal-login"
      ].$get(
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

      expect(getResponse.status).toBe(200);
      const fallbackBody = await getResponse.json();
      expect(fallbackBody.body).toContain("{%- auth0:widget -%}");
    });
  });

  describe("universal login full-page preview", () => {
    it("renders a full-page preview for a sample screen", async () => {
      const { managementApp, env } = await getTestServer();
      const managementClient = testClient(managementApp, env);
      const token = await getAdminToken();

      const response = await managementClient.branding.templates[
        "universal-login"
      ].preview.$post(
        {
          header: { "tenant-id": "tenantId" },
          json: { screen: "login" },
        },
        {
          headers: { authorization: `Bearer ${token}` },
        },
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/html");
      const html = await response.text();
      // Full page shell + SSR'd widget.
      expect(html).toContain("<meta charSet=");
      expect(html).toContain("authhero-widget");
      expect(html).toContain("data-authhero-widget-container");
    });

    it("reflects an unsaved template body passed in the request", async () => {
      const { managementApp, env } = await getTestServer();
      const managementClient = testClient(managementApp, env);
      const token = await getAdminToken();

      const response = await managementClient.branding.templates[
        "universal-login"
      ].preview.$post(
        {
          header: { "tenant-id": "tenantId" },
          json: {
            screen: "login",
            body: `<div class="preview-marker">PREVIEW_MARKER</div>{%- auth0:widget -%}`,
          },
        },
        {
          headers: { authorization: `Bearer ${token}` },
        },
      );

      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("PREVIEW_MARKER");
      expect(html).toContain("data-authhero-widget-container");
    });

    it("renders a full-document (Auth0-style) template as the whole page", async () => {
      const { managementApp, env } = await getTestServer();
      const managementClient = testClient(managementApp, env);
      const token = await getAdminToken();

      const response = await managementClient.branding.templates[
        "universal-login"
      ].preview.$post(
        {
          header: { "tenant-id": "tenantId" },
          json: {
            screen: "login",
            body: `<!DOCTYPE html><html><head>{%- auth0:head -%}</head><body><div class="my-doc">{%- auth0:widget -%}</div></body></html>`,
          },
        },
        {
          headers: { authorization: `Bearer ${token}` },
        },
      );

      expect(response.status).toBe(200);
      const html = await response.text();
      // The tenant's own document wrapper is preserved (not nested in the shell).
      expect(html).toContain('class="my-doc"');
      // auth0:head injected the functional essentials (the widget script).
      expect(html).toContain("/u/widget/authhero-widget.esm.js");
      expect(html).toContain("data-authhero-widget-container");
    });
  });
});
