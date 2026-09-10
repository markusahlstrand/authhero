/**
 * Phone chrome for the u2 login page.
 *
 * Below 480px the floating corner chips have nowhere to go — the widget fills
 * the screen, so a fixed pill either covers the form or gets dropped. They
 * used to be dropped: terms and the trust mark simply vanished on phones and
 * the settings chip sat on top of the card. They're now replaced by a footer
 * bar carrying the same content.
 *
 * The chrome itself lives in @authhero/widget/page-chrome so the widget demo
 * renders the identical markup; these tests pin the authhero side of that
 * contract.
 */
import { describe, expect, it } from "vitest";
import { renderWidgetPageResponse } from "../../src/routes/universal-login/u2-widget-page";
import { buildPreviewScreen } from "../../src/routes/management-api/branding-preview";

const branding = {
  logo_url: "https://authhero.com/logo.png",
  colors: { primary: "#6366f1", page_background: "#0f172a" },
};

const TERMS = "https://example.com/terms";
const POWERED_BY = {
  url: "https://authhero.com/trust.svg",
  href: "https://authhero.com",
  alt: "Powered by AuthHero",
  height: 14,
};

/** Extract the <=480px blocks from the page's inline stylesheet. */
function mobileCss(html: string): string {
  const blocks: string[] = [];
  const re = /@media\s*\(max-width:\s*480px\)\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    let depth = 1;
    let i = m.index + m[0].length;
    for (; i < html.length && depth > 0; i++) {
      if (html[i] === "{") depth++;
      else if (html[i] === "}") depth--;
    }
    blocks.push(html.slice(m.index, i));
  }
  return blocks.join("\n");
}

/** The page's own stylesheet, excluding the widget's inlined shadow CSS. */
function pageCss(html: string): string {
  const start = html.indexOf("<style>");
  const end = html.indexOf("</style>", start);
  return start === -1 ? "" : html.slice(start, end);
}

async function render(
  opts: {
    termsAndConditionsUrl?: string;
    poweredByLogo?: typeof POWERED_BY;
    availableLanguages?: string[];
  } = {},
) {
  const screen = buildPreviewScreen("login");
  const theme = {
    colors: { primary_button: "#6366f1", widget_background: "#ffffff" },
    page_background: { background_color: "#0f172a", page_layout: "center" },
  };
  const ctx = {
    html: (doc: unknown) => doc,
    req: { header: () => undefined, raw: { headers: new Headers() } },
    env: {},
    var: {},
  };
  const rendered: unknown = await renderWidgetPageResponse(ctx as never, {
    screenId: screen.name,
    screenJson: JSON.stringify(screen),
    brandingJson: JSON.stringify(branding),
    themeJson: JSON.stringify(theme),
    state: "preview",
    authParamsJson: JSON.stringify({ client_id: "preview" }),
    branding: branding as never,
    theme: theme as never,
    clientName: "Acme Inc",
    ...opts,
  });
  return typeof rendered === "string" ? rendered : String(rendered);
}

describe("u2 page — phone chrome", () => {
  it("renders a footer carrying terms, trust mark and controls", async () => {
    const html = await render({
      termsAndConditionsUrl: TERMS,
      poweredByLogo: POWERED_BY,
      availableLanguages: ["en", "sv"],
    });
    const footer = html.slice(
      html.indexOf('<footer class="ah-footer"'),
      html.indexOf("</footer>") + 9,
    );
    expect(footer).toContain(TERMS);
    expect(footer).toContain("ah-footer-trust");
    expect(footer).toContain("Toggle dark mode");
    expect(footer).toContain('<select aria-label="Language"');
  });

  it("swaps the corner chips for the footer under 480px", async () => {
    const css = mobileCss(await render({ termsAndConditionsUrl: TERMS }));
    expect(css).toMatch(/\.ah-chip,\s*\.ah-chip-legal\s*\{\s*display:\s*none/);
    expect(css).toMatch(/\.ah-footer\s*\{\s*display:\s*flex/);
  });

  it("keeps the footer hidden above the breakpoint", async () => {
    const css = pageCss(await render({ termsAndConditionsUrl: TERMS }));
    // The base rule hides it; only the mobile block reveals it.
    const base = css.slice(css.indexOf(".ah-footer {"));
    expect(base.slice(0, 200)).toMatch(/display:\s*none/);
  });

  it("reserves room so a tall form can't scroll under the footer", async () => {
    const css = mobileCss(await render({ termsAndConditionsUrl: TERMS }));
    expect(css).toMatch(/authhero-widget\s*\{\s*padding-bottom:/);
  });

  it("emits no footer when nothing is configured for it", async () => {
    const html = await render();
    expect(html).not.toContain('<footer class="ah-footer"');
  });

  it("still emits the corner chips for wide viewports", async () => {
    const html = await render({
      termsAndConditionsUrl: TERMS,
      poweredByLogo: POWERED_BY,
    });
    expect(html).toContain("ah-chip-settings");
    expect(html).toContain("ah-chip-legal");
    expect(html).toContain("ah-chip-trust");
  });

  it("omits the language picker for a single language", async () => {
    const html = await render({
      termsAndConditionsUrl: TERMS,
      availableLanguages: ["en"],
    });
    expect(html).not.toContain('<select aria-label="Language"');
  });
});
