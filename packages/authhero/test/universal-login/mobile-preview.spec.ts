/**
 * Manual preview generator (not part of the suite — gated behind PREVIEW=1).
 * Renders the u2 login page in both phone variants through the real pipeline
 * and writes them to /tmp. Open each and narrow the window below 480px:
 *
 *   PREVIEW=1 pnpm --filter authhero exec vitest run test/universal-login/mobile-preview.spec.ts
 *   open /tmp/u2-mobile-with-image.html /tmp/u2-mobile-no-image.html
 *
 * Expected under 480px:
 *  - with-image: the background image still fills the screen, the widget sits
 *    on it as a card with its radius and shadow intact.
 *  - no-image:   the card goes edge-to-edge and the page takes the widget's
 *    background colour.
 */
import { writeFileSync } from "node:fs";
import { test } from "vitest";
import { renderWidgetPageResponse } from "../../src/routes/universal-login/u2-widget-page";
import { buildPreviewScreen } from "../../src/routes/management-api/branding-preview";

const branding = {
  logo_url: "https://authhero.com/logo.png",
  colors: { primary: "#6366f1", page_background: "#0f172a" },
};

async function render(pageBackground: Record<string, string>) {
  const screen = buildPreviewScreen("login");
  const theme = {
    colors: { primary_button: "#6366f1", widget_background: "#ffffff" },
    page_background: pageBackground,
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
  });
  return typeof rendered === "string" ? rendered : String(rendered);
}

test.skipIf(process.env.PREVIEW !== "1")(
  "render both phone variants to /tmp",
  async () => {
    writeFileSync(
      "/tmp/u2-mobile-with-image.html",
      await render({
        background_color: "#0f172a",
        background_image_url:
          "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1600",
        page_layout: "center",
      }),
    );
    writeFileSync(
      "/tmp/u2-mobile-no-image.html",
      await render({ background_color: "#0f172a", page_layout: "center" }),
    );
    // eslint-disable-next-line no-console
    console.log(
      "\nWrote /tmp/u2-mobile-with-image.html and /tmp/u2-mobile-no-image.html\n",
    );
  },
);
