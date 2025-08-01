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
});
