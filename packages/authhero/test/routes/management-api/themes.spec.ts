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

  it("should preserve widget logo_position and header_text_alignment when set to 'left'", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);

    const token = await getAdminToken();

    // Create a full theme with logo_position and header_text_alignment set to "left"
    const themeData = {
      displayName: "Kvartal Theme",
      borders: {
        button_border_radius: 8,
        button_border_weight: 1,
        buttons_style: "pill" as const,
        input_border_radius: 8,
        input_border_weight: 1,
        inputs_style: "pill" as const,
        show_widget_shadow: true,
        widget_border_weight: 1,
        widget_corner_radius: 16,
      },
      colors: {
        base_focus_color: "#4F3985",
        base_hover_color: "#5F44A0",
        body_text: "#000000",
        captcha_widget_theme: "auto" as const,
        error: "#FC5A5A",
        header: "#000000",
        icons: "#666666",
        input_background: "#FFFFFF",
        input_border: "#BFBCD7",
        input_filled_text: "#000000",
        input_labels_placeholders: "#88869F",
        links_focused_components: "#4F3985",
        primary_button: "#4F3985",
        primary_button_label: "#FFFFFF",
        secondary_button_border: "#BFBCD7",
        secondary_button_label: "#000000",
        success: "#36BF76",
        widget_background: "#FFFFFF",
        widget_border: "#BFBCD7",
      },
      fonts: {
        body_text: { bold: false, size: 16 },
        buttons_text: { bold: false, size: 16 },
        font_url:
          "https://assets.sesamy.com/fonts/khteka/WOFF2/KHTeka-Regular.woff2",
        input_labels: { bold: false, size: 14 },
        links: { bold: false, size: 16 },
        links_style: "normal" as const,
        reference_text_size: 16,
        subtitle: { bold: false, size: 18 },
        title: { bold: true, size: 24 },
      },
      page_background: {
        background_color: "#F8F9FB",
        background_image_url:
          "https://assets.sesamy.dev/vendor-assets/kvartal/30b73efb-2a66-438b-bad5-d141b69bb5ce.jpg",
        page_layout: "center" as const,
      },
      widget: {
        header_text_alignment: "left" as const,
        logo_height: 36,
        logo_position: "left" as const,
        logo_url: "https://checkout.sesamy.com/images/kvartal-logo.svg",
        social_buttons_layout: "bottom" as const,
      },
    };

    const updateResponse =
      await managementClient.branding.themes.default.$patch(
        {
          json: themeData,
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

    // Verify the widget values are preserved correctly
    expect(updatedTheme.widget.logo_position).toBe("left");
    expect(updatedTheme.widget.header_text_alignment).toBe("left");
    expect(updatedTheme.widget.logo_height).toBe(36);
    expect(updatedTheme.widget.logo_url).toBe(
      "https://checkout.sesamy.com/images/kvartal-logo.svg",
    );
    expect(updatedTheme.widget.social_buttons_layout).toBe("bottom");

    // Verify we can retrieve the theme with correct values
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

    // These assertions specifically test the bug where "left" values
    // were being changed to "center"
    expect(retrievedTheme.widget.logo_position).toBe("left");
    expect(retrievedTheme.widget.header_text_alignment).toBe("left");
  });

  it("should preserve widget values when updating existing theme with 'left' alignment", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);

    const token = await getAdminToken();

    // First, create a theme with center values
    const initialTheme = {
      displayName: "Initial Theme",
      widget: {
        header_text_alignment: "center" as const,
        logo_height: 60,
        logo_position: "center" as const,
        logo_url: "https://example.com/logo.png",
        social_buttons_layout: "bottom" as const,
      },
    };

    await managementClient.branding.themes.default.$patch(
      {
        json: initialTheme,
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

    // Now update to use left alignment
    const updateResponse =
      await managementClient.branding.themes.default.$patch(
        {
          json: {
            widget: {
              header_text_alignment: "left" as const,
              logo_position: "left" as const,
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

    // Verify the widget values were updated to left
    expect(updatedTheme.widget.logo_position).toBe("left");
    expect(updatedTheme.widget.header_text_alignment).toBe("left");
    // Other values should be preserved
    expect(updatedTheme.widget.logo_height).toBe(60);
    expect(updatedTheme.widget.logo_url).toBe("https://example.com/logo.png");
  });
});
