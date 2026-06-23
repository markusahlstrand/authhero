import { describe, it, expect } from "vitest";
import {
  applyUniversalLoginTemplate,
  validateUniversalLoginTemplate,
  templateMountsWidget,
  templateIsFullDocument,
  DEFAULT_UNIVERSAL_LOGIN_TEMPLATE,
  REQUIRED_SLOT,
  type TemplateSlotOptions,
} from "../../src/routes/universal-login/universal-login-template";

const baseOpts: TemplateSlotOptions & {
  screenId: string;
  widgetContainerStyle?: string;
} = {
  widgetHtml: "<!--WIDGET-->",
  screenId: "login-id",
  clientName: "Acme",
  darkMode: "auto",
  logoUrl: "https://cdn.example.com/logo.png",
  language: "en",
  availableLanguages: ["en", "sv"],
  poweredBy: { url: "https://cdn.example.com/trust.png", height: 18 },
  termsAndConditionsUrl: "https://example.com/terms",
  branding: {
    logo_url: "https://cdn.example.com/logo.png",
    colors: { primary: "#ff0000" },
  },
};

describe("applyUniversalLoginTemplate (Liquid)", () => {
  it("renders the default template with widget + corner chips", async () => {
    const html = await applyUniversalLoginTemplate(
      DEFAULT_UNIVERSAL_LOGIN_TEMPLATE,
      baseOpts,
    );
    // Widget mount
    expect(html).toContain("data-authhero-widget-container");
    expect(html).toContain("<!--WIDGET-->");
    // In-flow stack regions
    expect(html).toContain('data-ah-slot="above-widget"');
    expect(html).toContain('data-ah-slot="below-widget"');
    // Corner chips
    expect(html).toContain('data-ah-slot="top-left"'); // logo
    expect(html).toContain('data-ah-slot="top-right"'); // settings
    expect(html).toContain('data-ah-slot="bottom-left"'); // powered-by
    expect(html).toContain('data-ah-slot="bottom-right"'); // legal
  });

  it("is backward compatible with the old flat token template", async () => {
    const legacy = `${REQUIRED_SLOT}\n{%- authhero:logo -%}\n{%- authhero:legal -%}`;
    const html = await applyUniversalLoginTemplate(legacy, baseOpts);
    expect(html).toContain("data-authhero-widget-container");
    expect(html).toContain('data-ah-slot="top-left"');
    expect(html).toContain('data-ah-slot="bottom-right"');
    // settings/powered-by omitted → not present
    expect(html).not.toContain('data-ah-slot="top-right"');
  });

  it("expands Liquid variables", async () => {
    const html = await applyUniversalLoginTemplate(
      `<span id="v">{{ branding.logo_url }}</span>${REQUIRED_SLOT}`,
      baseOpts,
    );
    expect(html).toContain(
      '<span id="v">https://cdn.example.com/logo.png</span>',
    );
  });

  it("supports control flow around slots", async () => {
    const tpl = `{% if branding.colors.primary %}<b>themed</b>{% endif %}${REQUIRED_SLOT}`;
    const html = await applyUniversalLoginTemplate(tpl, baseOpts);
    expect(html).toContain("<b>themed</b>");
    expect(html).toContain("data-authhero-widget-container");
  });

  it("applies the chip style argument (plain/pill)", async () => {
    const plain = await applyUniversalLoginTemplate(
      `${REQUIRED_SLOT}{%- authhero:legal style="plain" -%}`,
      baseOpts,
    );
    expect(plain).toContain("ah-chip-legal ah-chip--plain");

    const pill = await applyUniversalLoginTemplate(
      `${REQUIRED_SLOT}{%- authhero:powered-by style="pill" -%}`,
      baseOpts,
    );
    expect(pill).toContain("ah-chip--pill");

    // No style arg → no modifier class (auto/default behavior).
    const auto = await applyUniversalLoginTemplate(
      `${REQUIRED_SLOT}{%- authhero:legal -%}`,
      baseOpts,
    );
    expect(auto).toContain('class="ah-chip-legal"');
    expect(auto).not.toContain("ah-chip--");
  });

  it("exposes the page context for conditional layout", async () => {
    const withImage = await applyUniversalLoginTemplate(
      `{% if page.has_background_image %}HAS_BG{% else %}NO_BG{% endif %}${REQUIRED_SLOT}`,
      {
        ...baseOpts,
        theme: {
          page_background: {
            background_image_url: "https://cdn.example.com/bg.jpg",
          },
        },
      },
    );
    expect(withImage).toContain("HAS_BG");

    const withoutImage = await applyUniversalLoginTemplate(
      `{% if page.has_background_image %}HAS_BG{% else %}NO_BG{% endif %}${REQUIRED_SLOT}`,
      baseOpts,
    );
    expect(withoutImage).toContain("NO_BG");
  });

  it("renders unknown slots as empty", async () => {
    const html = await applyUniversalLoginTemplate(
      `${REQUIRED_SLOT}{%- authhero:does-not-exist -%}DONE`,
      baseOpts,
    );
    expect(html).toContain("DONE");
    expect(html).toContain("data-authhero-widget-container");
  });

  it("falls back to a working body when the template is malformed", async () => {
    // Unclosed tag — Liquid parse throws, fallback to default template.
    const html = await applyUniversalLoginTemplate(
      `{% if branding %}${REQUIRED_SLOT}`,
      baseOpts,
    );
    expect(html).toContain("data-authhero-widget-container");
  });
});

describe("auth0:head (full-document compatibility)", () => {
  it("emits the provided head essentials", async () => {
    const html = await applyUniversalLoginTemplate(
      `<!DOCTYPE html><html><head>{%- auth0:head -%}</head><body>${REQUIRED_SLOT}</body></html>`,
      { ...baseOpts, headHtml: "<style>/*HEAD*/</style>" },
    );
    expect(html).toContain("<style>/*HEAD*/</style>");
    expect(html).toContain("data-authhero-widget-container");
  });

  it("renders empty when no head essentials are supplied (fragment path)", async () => {
    const html = await applyUniversalLoginTemplate(
      `{%- auth0:head -%}${REQUIRED_SLOT}`,
      baseOpts,
    );
    expect(html).not.toContain("auth0:head");
    expect(html).toContain("data-authhero-widget-container");
  });
});

describe("buildHeadEssentials (full-document page layout)", () => {
  it("emits a centered body layout so a default Auth0 template isn't unstyled", async () => {
    const { buildHeadEssentials } = await import(
      "../../src/routes/universal-login/u2-widget-page"
    );
    const head = buildHeadEssentials({
      clientName: "Acme",
      branding: { colors: { page_background: "#101010" } },
      theme: { page_background: { background_color: "#222" } },
    });
    // The full-document path owns <body>, so the centering/background that the
    // fragment path applies inline must be present in the injected page CSS.
    expect(head).toContain("min-height: 100vh");
    expect(head).toContain("display: flex");
    expect(head).toContain("justify-content: center");
    expect(head).toContain("#222");
  });
});

describe("templateIsFullDocument", () => {
  it("detects a full HTML document vs a body fragment", () => {
    expect(
      templateIsFullDocument(
        `<!DOCTYPE html><html><head></head><body>${REQUIRED_SLOT}</body></html>`,
      ),
    ).toBe(true);
    expect(templateIsFullDocument(REQUIRED_SLOT)).toBe(false);
    expect(
      templateIsFullDocument(`<div class="x">${REQUIRED_SLOT}</div>`),
    ).toBe(false);
  });
});

describe("validateUniversalLoginTemplate", () => {
  it("accepts the default template", () => {
    expect(
      validateUniversalLoginTemplate(DEFAULT_UNIVERSAL_LOGIN_TEMPLATE).valid,
    ).toBe(true);
  });

  it("accepts the widget tag without whitespace-trim dashes", () => {
    expect(validateUniversalLoginTemplate("{% auth0:widget %}").valid).toBe(
      true,
    );
  });

  it("rejects a template missing the widget", () => {
    const result = validateUniversalLoginTemplate("<div>no widget</div>");
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toMatch(/widget/i);
  });

  it("rejects malformed Liquid", () => {
    const result = validateUniversalLoginTemplate(`{% if x %}${REQUIRED_SLOT}`);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toMatch(/liquid/i);
  });
});

describe("templateMountsWidget", () => {
  it("matches every valid spelling of the widget tag", () => {
    expect(templateMountsWidget("{%- auth0:widget -%}")).toBe(true);
    expect(templateMountsWidget("{% auth0:widget %}")).toBe(true);
    expect(templateMountsWidget("{%-auth0:widget-%}")).toBe(true);
    expect(templateMountsWidget("{% auth0 : widget %}")).toBe(true);
    expect(templateMountsWidget("no widget here")).toBe(false);
  });
});
