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
    it("should return 404 when no template exists", async () => {
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

      expect(response.status).toBe(404);
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

    it("should return 400 when template is missing auth0:head tag", async () => {
      const { managementApp, env } = await getTestServer();
      const managementClient = testClient(managementApp, env);
      const token = await getAdminToken();

      const template = {
        body: "<!DOCTYPE html><html><head></head><body>{%- auth0:widget -%}</body></html>",
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

    it("should return 400 when template is missing auth0:widget tag", async () => {
      const { managementApp, env } = await getTestServer();
      const managementClient = testClient(managementApp, env);
      const token = await getAdminToken();

      const template = {
        body: "<!DOCTYPE html><html><head>{%- auth0:head -%}</head><body></body></html>",
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

      // Verify it's deleted
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

      expect(getResponse.status).toBe(404);
    });
  });
});
