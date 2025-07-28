import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getAdminToken } from "../../helpers/token";
import { getTestServer } from "../../helpers/test-server";

describe("themes", () => {
  it("should get default theme when no theme is stored", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);

    const token = await getAdminToken();
    const response = await managementClient.branding.themes.default.$get(
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
    const theme = await response.json();

    expect(theme).toHaveProperty("themeId", "default");
    expect(theme).toHaveProperty("displayName", "Default Theme");
    expect(theme).toHaveProperty("colors");
    expect(theme).toHaveProperty("borders");
    expect(theme).toHaveProperty("fonts");
    expect(theme).toHaveProperty("page_background");
    expect(theme).toHaveProperty("widget");
  });

  it("should create and update a theme", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);

    const token = await getAdminToken();

    // Create/update theme
    const updateResponse =
      await managementClient.branding.themes.default.$patch(
        {
          json: {
            displayName: "Custom Theme",
            colors: {
              primary_button: "#FF0000",
              primary_button_label: "#FFFFFF",
            },
          },
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
    expect(updateResponse.status).toBe(200);
    const updatedTheme = await updateResponse.json();

    expect(updatedTheme).toHaveProperty("displayName", "Custom Theme");
    expect(updatedTheme.colors).toHaveProperty("primary_button", "#FF0000");
    expect(updatedTheme.colors).toHaveProperty(
      "primary_button_label",
      "#FFFFFF",
    );

    // Verify we can retrieve the updated theme
    const getResponse = await managementClient.branding.themes.default.$get(
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
    const retrievedTheme = await getResponse.json();

    expect(retrievedTheme).toHaveProperty("displayName", "Custom Theme");
    expect(retrievedTheme.colors).toHaveProperty("primary_button", "#FF0000");
  });
});
