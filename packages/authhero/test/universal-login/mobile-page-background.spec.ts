/**
 * Phone layout (<=480px) for the u2 widget page.
 *
 * Two variants, picked by whether the tenant set a page background image:
 *
 *  - image present  -> the card floats. The body keeps its background (the
 *    image), the tint overlay stays, and the widget carries `floating` so its
 *    own stylesheet doesn't paint over the image with 100vh of widget colour.
 *  - no image       -> the card fills the screen edge-to-edge and the page
 *    background collapses into the widget's colour.
 *
 * The regression these guard: a blanket
 * `body { background: <widget bg> }` at <=480px, which wiped the tenant's
 * background image on every phone.
 */
import { describe, expect, it } from "vitest";
import { renderWidgetPageResponse } from "../../src/routes/universal-login/u2-widget-page";
import { buildPreviewScreen } from "../../src/routes/management-api/branding-preview";

const BG_IMAGE = "https://cdn.example.com/hero.jpg";

const branding = {
  logo_url: "https://authhero.com/logo.png",
  colors: { primary: "#6366f1", page_background: "#0f172a" },
};

/** Extract the <=480px blocks from the page's inline stylesheet. */
function mobileCss(html: string): string {
  const blocks: string[] = [];
  const re = /@media\s*\(max-width:\s*480px\)\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    // Walk braces from the block's opening `{` to its matching `}`.
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

async function render(pageBackground: Record<string, string>) {
  const screen = buildPreviewScreen("login");
  const theme = {
    colors: { primary_button: "#6366f1", widget_background: "#ffffff" },
    page_background: pageBackground,
  };
  // The default (non-custom-template) path hands `ctx.html` a hono/jsx node
  // rather than a string, so capture it raw and stringify below.
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
  });

  return toHtml(rendered);
}

/** Stringify a hono/jsx node (or pass a string straight through). */
async function toHtml(rendered: unknown): Promise<string> {
  if (typeof rendered === "string") return rendered;
  const out: unknown = String(rendered);
  return typeof out === "string" ? out : String(await out);
}

describe("u2 page — phone layout", () => {
  describe("with a page background image", () => {
    it("does not override the body background", async () => {
      const css = mobileCss(
        await render({
          background_color: "#0f172a",
          background_image_url: BG_IMAGE,
          page_layout: "center",
        }),
      );
      expect(css).not.toMatch(/body\s*\{[^}]*background:/);
    });

    it("keeps the image on the body and the tint overlay visible", async () => {
      const html = await render({
        background_color: "#0f172a",
        background_image_url: BG_IMAGE,
        page_layout: "center",
      });
      expect(html).toContain(BG_IMAGE);
      expect(html).toContain('class="ah-bg-tint"');
      expect(mobileCss(html)).toMatch(/\.ah-bg-tint\s*\{\s*display:\s*block/);
    });

    it("marks the widget as floating so it doesn't go full-bleed", async () => {
      const html = await render({
        background_color: "#0f172a",
        background_image_url: BG_IMAGE,
        page_layout: "center",
      });
      expect(html).toMatch(/<authhero-widget[^>]*\sfloating(?:=""|[\s>])/);
    });
  });

  describe("without a page background image", () => {
    it("collapses the page background into the widget colour", async () => {
      const css = mobileCss(
        await render({ background_color: "#0f172a", page_layout: "center" }),
      );
      expect(css).toMatch(/body\s*\{[^}]*background:\s*#ffffff\s*[;}]/);
      expect(css).toMatch(/\.ah-bg-tint\s*\{\s*display:\s*none/);
    });

    it("leaves the widget full-bleed (no floating attribute)", async () => {
      const html = await render({
        background_color: "#0f172a",
        page_layout: "center",
      });
      expect(html).not.toMatch(/<authhero-widget[^>]*\sfloating(?:=""|[\s>])/);
    });
  });
});
