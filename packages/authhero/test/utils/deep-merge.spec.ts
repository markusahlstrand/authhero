import { describe, it, expect } from "vitest";
import { deepMergePatch } from "../../src/utils/deep-merge";
import { DEFAULT_THEME } from "../../src/constants/defaultTheme";

describe("deepMergePatch", () => {
  it("should deeply merge patch onto target", () => {
    const target = { a: 1, b: { c: 2, d: 3 } };
    const patch = { b: { c: 4 } };
    const result = deepMergePatch(target, patch);

    expect(result).toEqual({ a: 1, b: { c: 4, d: 3 } });
  });

  it("should not mutate the original target", () => {
    const target = { a: 1, b: { c: 2 } };
    const patch = { b: { c: 3 } };
    deepMergePatch(target, patch);

    expect(target).toEqual({ a: 1, b: { c: 2 } });
  });

  it("should replace primitive values", () => {
    const target = { a: "original" };
    const patch = { a: "patched" };
    const result = deepMergePatch(target, patch);

    expect(result.a).toBe("patched");
  });

  it("should preserve widget logo_position='left' when merging with DEFAULT_THEME", () => {
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

    // Verify the DEFAULT_THEME has center values (this is the starting point)
    expect(DEFAULT_THEME.widget.logo_position).toBe("center");
    expect(DEFAULT_THEME.widget.header_text_alignment).toBe("center");

    // Merge the theme data onto the default theme
    const result = deepMergePatch(DEFAULT_THEME, themeData);

    // The result should have the patched 'left' values, not the default 'center' values
    expect(result.widget.logo_position).toBe("left");
    expect(result.widget.header_text_alignment).toBe("left");
    expect(result.widget.logo_height).toBe(36);
    expect(result.widget.logo_url).toBe(
      "https://checkout.sesamy.com/images/kvartal-logo.svg",
    );
  });

  it("should allow partial widget updates to override existing values", () => {
    const existingTheme = {
      ...DEFAULT_THEME,
      displayName: "Existing Theme",
      widget: {
        header_text_alignment: "center" as const,
        logo_height: 60,
        logo_position: "center" as const,
        logo_url: "https://example.com/logo.png",
        social_buttons_layout: "bottom" as const,
      },
    };

    const patch = {
      widget: {
        header_text_alignment: "left" as const,
        logo_position: "left" as const,
      },
    };

    const result = deepMergePatch(existingTheme, patch);

    // The patched values should override
    expect(result.widget.logo_position).toBe("left");
    expect(result.widget.header_text_alignment).toBe("left");

    // Other widget values should be preserved
    expect(result.widget.logo_height).toBe(60);
    expect(result.widget.logo_url).toBe("https://example.com/logo.png");
    expect(result.widget.social_buttons_layout).toBe("bottom");
  });

  it("should handle arrays by replacing them (not merging)", () => {
    const target = { arr: [1, 2, 3] };
    const patch = { arr: [4, 5] };
    const result = deepMergePatch(target, patch);

    expect(result.arr).toEqual([4, 5]);
  });

  it("should handle null values in patch", () => {
    const target = { a: 1, b: { c: 2 } };
    const patch = { b: { c: null } };
    const result = deepMergePatch(target, patch as any);

    expect(result.b.c).toBeNull();
  });
});
