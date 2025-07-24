import { describe, expect, it } from "vitest";
import { getTestServer } from "../helpers/test-server";

describe("themes", () => {
  it("should support CRUD operations", async () => {
    const { data } = await getTestServer();

    // Create a tenant first
    await data.tenants.create({
      id: "tenantId",
      name: "Test Tenant",
      audience: "https://example.com",
      sender_email: "login@example.com",
      sender_name: "SenderName",
    });

    // ----------------------------------------
    // Create a theme
    // ----------------------------------------
    const themeData = {
      displayName: "Test Theme",
      colors: {
        primary_button: "#007bff",
        primary_button_label: "#ffffff",
        secondary_button_border: "#6c757d",
        secondary_button_label: "#6c757d",
        base_focus_color: "#007bff",
        base_hover_color: "#0056b3",
        body_text: "#212529",
        captcha_widget_theme: "auto" as const,
        error: "#dc3545",
        header: "#212529",
        icons: "#6c757d",
        input_background: "#ffffff",
        input_border: "#ced4da",
        input_filled_text: "#495057",
        input_labels_placeholders: "#6c757d",
        links_focused_components: "#007bff",
        success: "#28a745",
        widget_background: "#ffffff",
        widget_border: "#dee2e6",
      },
      borders: {
        button_border_radius: 4,
        button_border_weight: 1,
        buttons_style: "pill" as const,
        input_border_radius: 4,
        input_border_weight: 1,
        inputs_style: "pill" as const,
        show_widget_shadow: true,
        widget_border_weight: 1,
        widget_corner_radius: 8,
      },
      fonts: {
        body_text: {
          bold: false,
          size: 14,
        },
        buttons_text: {
          bold: true,
          size: 16,
        },
        font_url:
          "https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap",
        input_labels: {
          bold: false,
          size: 12,
        },
        links: {
          bold: false,
          size: 14,
        },
        links_style: "normal" as const,
        reference_text_size: 14,
        subtitle: {
          bold: false,
          size: 16,
        },
        title: {
          bold: true,
          size: 24,
        },
      },
      page_background: {
        background_color: "#f8f9fa",
        background_image_url: "",
        page_layout: "center" as const,
      },
      widget: {
        header_text_alignment: "center" as const,
        logo_height: 60,
        logo_position: "center" as const,
        logo_url: "https://example.com/logo.png",
        social_buttons_layout: "bottom" as const,
      },
    };

    const createdTheme = await data.themes.create("tenantId", themeData);

    expect(createdTheme).toMatchObject({
      displayName: "Test Theme",
      colors: expect.objectContaining({
        primary_button: "#007bff",
        primary_button_label: "#ffffff",
      }),
      borders: expect.objectContaining({
        button_border_radius: 4,
        buttons_style: "pill",
      }),
    });
    expect(createdTheme.themeId).toBeDefined();

    const themeId = createdTheme.themeId;

    // ----------------------------------------
    // Get the theme
    // ----------------------------------------
    const retrievedTheme = await data.themes.get("tenantId", themeId);

    console.log(retrievedTheme);
    expect(retrievedTheme).toMatchObject({
      themeId,
      displayName: "Test Theme",
      colors: expect.objectContaining({
        primary_button: "#007bff",
        primary_button_label: "#ffffff",
      }),
    });

    // ----------------------------------------
    // Update the theme
    // ----------------------------------------
    const updateData = {
      displayName: "Updated Test Theme",
      colors: {
        ...themeData.colors,
        primary_button: "#28a745",
      },
    };

    await data.themes.update("tenantId", themeId, updateData);

    // Get the updated theme
    const updatedTheme = await data.themes.get("tenantId", themeId);
    expect(updatedTheme).toMatchObject({
      themeId,
      displayName: "Updated Test Theme",
      colors: expect.objectContaining({
        primary_button: "#28a745",
        primary_button_label: "#ffffff",
      }),
    });

    // ----------------------------------------
    // Remove the theme
    // ----------------------------------------
    const removeResult = await data.themes.remove("tenantId", themeId);
    expect(removeResult).toBe(true);

    // ----------------------------------------
    // Verify theme was removed
    // ----------------------------------------
    const removedTheme = await data.themes.get("tenantId", themeId);
    expect(removedTheme).toBe(null);
  });

  it("should return null when getting non-existent theme", async () => {
    const { data } = await getTestServer();

    // Create a tenant first
    await data.tenants.create({
      id: "tenantId",
      name: "Test Tenant",
      audience: "https://example.com",
      sender_email: "login@example.com",
      sender_name: "SenderName",
    });

    const theme = await data.themes.get("tenantId", "non-existent-theme");
    expect(theme).toBe(null);
  });

  it("should handle multiple themes for different tenants", async () => {
    const { data } = await getTestServer();

    // Create two tenants
    await data.tenants.create({
      id: "tenant1",
      name: "Test Tenant 1",
      audience: "https://example1.com",
      sender_email: "login@example1.com",
      sender_name: "SenderName1",
    });

    await data.tenants.create({
      id: "tenant2",
      name: "Test Tenant 2",
      audience: "https://example2.com",
      sender_email: "login@example2.com",
      sender_name: "SenderName2",
    });

    const themeData1 = {
      displayName: "Tenant 1 Theme",
      colors: {
        primary_button: "#007bff",
        primary_button_label: "#ffffff",
        secondary_button_border: "#6c757d",
        secondary_button_label: "#6c757d",
        base_focus_color: "#007bff",
        base_hover_color: "#0056b3",
        body_text: "#212529",
        captcha_widget_theme: "auto" as const,
        error: "#dc3545",
        header: "#212529",
        icons: "#6c757d",
        input_background: "#ffffff",
        input_border: "#ced4da",
        input_filled_text: "#495057",
        input_labels_placeholders: "#6c757d",
        links_focused_components: "#007bff",
        success: "#28a745",
        widget_background: "#ffffff",
        widget_border: "#dee2e6",
      },
      borders: {
        button_border_radius: 4,
        button_border_weight: 1,
        buttons_style: "pill" as const,
        input_border_radius: 4,
        input_border_weight: 1,
        inputs_style: "pill" as const,
        show_widget_shadow: true,
        widget_border_weight: 1,
        widget_corner_radius: 8,
      },
      fonts: {
        body_text: { bold: false, size: 14 },
        buttons_text: { bold: true, size: 16 },
        font_url:
          "https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap",
        input_labels: { bold: false, size: 12 },
        links: { bold: false, size: 14 },
        links_style: "normal" as const,
        reference_text_size: 14,
        subtitle: { bold: false, size: 16 },
        title: { bold: true, size: 24 },
      },
      page_background: {
        background_color: "#f8f9fa",
        background_image_url: "",
        page_layout: "center" as const,
      },
      widget: {
        header_text_alignment: "center" as const,
        logo_height: 60,
        logo_position: "center" as const,
        logo_url: "https://example1.com/logo.png",
        social_buttons_layout: "bottom" as const,
      },
    };

    const themeData2 = {
      ...themeData1,
      displayName: "Tenant 2 Theme",
      colors: {
        ...themeData1.colors,
        primary_button: "#28a745",
      },
      widget: {
        ...themeData1.widget,
        logo_url: "https://example2.com/logo.png",
      },
    };

    // Create themes for both tenants
    const theme1 = await data.themes.create("tenant1", themeData1);
    const theme2 = await data.themes.create("tenant2", themeData2);

    // Verify themes are isolated by tenant
    const retrieved1 = await data.themes.get("tenant1", theme1.themeId);
    const retrieved2 = await data.themes.get("tenant2", theme2.themeId);

    expect(retrieved1?.displayName).toBe("Tenant 1 Theme");
    expect(retrieved1?.colors.primary_button).toBe("#007bff");
    expect(retrieved1?.widget.logo_url).toBe("https://example1.com/logo.png");

    expect(retrieved2?.displayName).toBe("Tenant 2 Theme");
    expect(retrieved2?.colors.primary_button).toBe("#28a745");
    expect(retrieved2?.widget.logo_url).toBe("https://example2.com/logo.png");

    // Verify cross-tenant isolation
    const crossTenant1 = await data.themes.get("tenant1", theme2.themeId);
    const crossTenant2 = await data.themes.get("tenant2", theme1.themeId);

    expect(crossTenant1).toBe(null);
    expect(crossTenant2).toBe(null);
  });

  it("should handle partial updates correctly", async () => {
    const { data } = await getTestServer();

    // Create a tenant first
    await data.tenants.create({
      id: "tenantId",
      name: "Test Tenant",
      audience: "https://example.com",
      sender_email: "login@example.com",
      sender_name: "SenderName",
    });

    // Create initial theme
    const initialThemeData = {
      displayName: "Initial Theme",
      colors: {
        primary_button: "#007bff",
        primary_button_label: "#ffffff",
        secondary_button_border: "#6c757d",
        secondary_button_label: "#6c757d",
        base_focus_color: "#007bff",
        base_hover_color: "#0056b3",
        body_text: "#212529",
        captcha_widget_theme: "auto" as const,
        error: "#dc3545",
        header: "#212529",
        icons: "#6c757d",
        input_background: "#ffffff",
        input_border: "#ced4da",
        input_filled_text: "#495057",
        input_labels_placeholders: "#6c757d",
        links_focused_components: "#007bff",
        success: "#28a745",
        widget_background: "#ffffff",
        widget_border: "#dee2e6",
      },
      borders: {
        button_border_radius: 4,
        button_border_weight: 1,
        buttons_style: "pill" as const,
        input_border_radius: 4,
        input_border_weight: 1,
        inputs_style: "pill" as const,
        show_widget_shadow: true,
        widget_border_weight: 1,
        widget_corner_radius: 8,
      },
      fonts: {
        body_text: { bold: false, size: 14 },
        buttons_text: { bold: true, size: 16 },
        font_url:
          "https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap",
        input_labels: { bold: false, size: 12 },
        links: { bold: false, size: 14 },
        links_style: "normal" as const,
        reference_text_size: 14,
        subtitle: { bold: false, size: 16 },
        title: { bold: true, size: 24 },
      },
      page_background: {
        background_color: "#f8f9fa",
        background_image_url: "",
        page_layout: "center" as const,
      },
      widget: {
        header_text_alignment: "center" as const,
        logo_height: 60,
        logo_position: "center" as const,
        logo_url: "https://example.com/logo.png",
        social_buttons_layout: "bottom" as const,
      },
    };

    const createdTheme = await data.themes.create("tenantId", initialThemeData);
    const themeId = createdTheme.themeId;

    // Perform partial update (only displayName)
    await data.themes.update("tenantId", themeId, {
      displayName: "Updated Theme Name Only",
    });

    const partiallyUpdatedTheme = await data.themes.get("tenantId", themeId);
    expect(partiallyUpdatedTheme?.displayName).toBe("Updated Theme Name Only");
    // Verify other properties remain unchanged
    expect(partiallyUpdatedTheme?.colors.primary_button).toBe("#007bff");
    expect(partiallyUpdatedTheme?.widget.logo_url).toBe(
      "https://example.com/logo.png",
    );
  });
});
