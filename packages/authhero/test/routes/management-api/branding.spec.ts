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
    it("should return default template when none is set", async () => {
      const { managementApp, env } = await getTestServer();
      const managementClient = testClient(managementApp, env);

      const token = await getAdminToken();
      const response =
        await managementClient.branding.templates["universal-login"].$get(
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
      expect(body.template).toContain("{%- auth0:head -%}");
      expect(body.template).toContain("{%- auth0:widget -%}");
    });

    it("should create a new template and return 201", async () => {
      const { managementApp, env } = await getTestServer();
      const managementClient = testClient(managementApp, env);

      const token = await getAdminToken();
      const customTemplate = `<!DOCTYPE html>
<html>
  <head>{%- auth0:head -%}</head>
  <body class="custom">{%- auth0:widget -%}</body>
</html>`;

      const response =
        await managementClient.branding.templates["universal-login"].$put(
          {
            header: {
              "tenant-id": "tenantId",
            },
            json: {
              template: customTemplate,
            },
          },
          {
            headers: {
              authorization: `Bearer ${token}`,
            },
          },
        );

      expect(response.status).toBe(201);
    });

    it("should update an existing template and return 204", async () => {
      const { managementApp, env } = await getTestServer();
      const managementClient = testClient(managementApp, env);

      const token = await getAdminToken();
      const initialTemplate = `<!DOCTYPE html>
<html>
  <head>{%- auth0:head -%}</head>
  <body>{%- auth0:widget -%}</body>
</html>`;

      // Create template first
      await managementClient.branding.templates["universal-login"].$put(
        {
          header: {
            "tenant-id": "tenantId",
          },
          json: {
            template: initialTemplate,
          },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      const updatedTemplate = `<!DOCTYPE html>
<html>
  <head>{%- auth0:head -%}</head>
  <body class="updated">{%- auth0:widget -%}</body>
</html>`;

      // Update template
      const response =
        await managementClient.branding.templates["universal-login"].$put(
          {
            header: {
              "tenant-id": "tenantId",
            },
            json: {
              template: updatedTemplate,
            },
          },
          {
            headers: {
              authorization: `Bearer ${token}`,
            },
          },
        );

      expect(response.status).toBe(204);

      // Verify the template was updated
      const getResponse =
        await managementClient.branding.templates["universal-login"].$get(
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

      const body = await getResponse.json();
      expect(body.template).toContain('class="updated"');
    });

    it("should return 400 when template is missing auth0:head tag", async () => {
      const { managementApp, env } = await getTestServer();
      const managementClient = testClient(managementApp, env);

      const token = await getAdminToken();
      const invalidTemplate = `<!DOCTYPE html>
<html>
  <head></head>
  <body>{%- auth0:widget -%}</body>
</html>`;

      const response =
        await managementClient.branding.templates["universal-login"].$put(
          {
            header: {
              "tenant-id": "tenantId",
            },
            json: {
              template: invalidTemplate,
            },
          },
          {
            headers: {
              authorization: `Bearer ${token}`,
            },
          },
        );

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.message).toContain("auth0:head");
    });

    it("should return 400 when template is missing auth0:widget tag", async () => {
      const { managementApp, env } = await getTestServer();
      const managementClient = testClient(managementApp, env);

      const token = await getAdminToken();
      const invalidTemplate = `<!DOCTYPE html>
<html>
  <head>{%- auth0:head -%}</head>
  <body></body>
</html>`;

      const response =
        await managementClient.branding.templates["universal-login"].$put(
          {
            header: {
              "tenant-id": "tenantId",
            },
            json: {
              template: invalidTemplate,
            },
          },
          {
            headers: {
              authorization: `Bearer ${token}`,
            },
          },
        );

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.message).toContain("auth0:widget");
    });

    it("should accept template with alternative Liquid tag syntax", async () => {
      const { managementApp, env } = await getTestServer();
      const managementClient = testClient(managementApp, env);

      const token = await getAdminToken();
      // Use non-trimming Liquid tags ({% instead of {%-)
      const templateWithAltSyntax = `<!DOCTYPE html>
<html>
  <head>{% auth0:head %}</head>
  <body>{% auth0:widget %}</body>
</html>`;

      const response =
        await managementClient.branding.templates["universal-login"].$put(
          {
            header: {
              "tenant-id": "tenantId",
            },
            json: {
              template: templateWithAltSyntax,
            },
          },
          {
            headers: {
              authorization: `Bearer ${token}`,
            },
          },
        );

      expect([201, 204]).toContain(response.status);
    });

    it("should delete a template and return 204", async () => {
      const { managementApp, env } = await getTestServer();
      const managementClient = testClient(managementApp, env);

      const token = await getAdminToken();

      // Create a template first
      const template = `<!DOCTYPE html>
<html>
  <head>{%- auth0:head -%}</head>
  <body>{%- auth0:widget -%}</body>
</html>`;

      await managementClient.branding.templates["universal-login"].$put(
        {
          header: {
            "tenant-id": "tenantId",
          },
          json: {
            template,
          },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      // Delete the template
      const response =
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

      expect(response.status).toBe(204);

      // Verify it returns the default template after deletion
      const getResponse =
        await managementClient.branding.templates["universal-login"].$get(
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
      // Should now return the default template again
      const body = await getResponse.json();
      expect(body.template).toContain("{%- auth0:head -%}");
    });
  });
});
