/**
 * Manual preview generator (not part of the suite — gated behind PREVIEW=1).
 * Renders the canonical Auth0 full-document Universal Login template through
 * the real render pipeline and writes an HTML file you open in a browser to
 * eyeball the fix:
 *
 *   PREVIEW=1 pnpm --filter authhero exec vitest run test/universal-login/fulldoc-preview.spec.ts
 *   open /tmp/auth0-fulldoc-preview.html
 *
 * Expected: the widget card is centered on the dark page background. Before the
 * fix it rendered top-left on a blank white page.
 */
import { writeFileSync } from "node:fs";
import { test } from "vitest";
import { renderWidgetPageResponse } from "../../src/routes/universal-login/u2-widget-page";
import { buildPreviewScreen } from "../../src/routes/management-api/branding-preview";

const AUTH0_FULL_DOC = `<!DOCTYPE html>
<html>
  <head>
    {%- auth0:head -%}
  </head>
  <body>
    {%- auth0:widget -%}
  </body>
</html>`;

const branding = {
  logo_url: "https://authhero.com/logo.png",
  colors: { primary: "#6366f1", page_background: "#0f172a" },
};

const theme = {
  colors: { primary_button: "#6366f1", widget_background: "#ffffff" },
  page_background: { background_color: "#0f172a", page_layout: "center" },
};

test.skipIf(!process.env.PREVIEW)(
  "render full-document Auth0 template to /tmp",
  async () => {
    const screen = buildPreviewScreen("login");
    const ctx = { html: (doc: string) => doc };

    const html = (await renderWidgetPageResponse(ctx as never, {
      screenId: screen.name,
      screenJson: JSON.stringify(screen),
      brandingJson: JSON.stringify(branding),
      themeJson: JSON.stringify(theme),
      state: "preview",
      authParamsJson: JSON.stringify({ client_id: "preview" }),
      branding: branding as never,
      theme: theme as never,
      clientName: "Acme Inc",
      customTemplateBody: AUTH0_FULL_DOC,
    })) as unknown as string;

    const out = "/tmp/auth0-fulldoc-preview.html";
    writeFileSync(out, html);
    // eslint-disable-next-line no-console
    console.log(
      `\nWrote ${out} — body layout present: ${/body\s*\{[^}]*min-height: 100vh/.test(html)}\n`,
    );
  },
);
