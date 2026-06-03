/**
 * Regression test for renderWidgetSSR's JSON transport.
 *
 * Bug: JSON was embedded in HTML attributes (`screen='…'`). The HTML parser
 * decodes character references inside attribute values, so any `&quot;` /
 * `&amp;` that a screen handler emitted (e.g. the try-connection-result
 * screen wraps its userinfo dump in `escapeHtml` so it's safe as innerHTML)
 * got eagerly decoded by the outer parser and corrupted the JSON. The
 * widget then failed to JSON.parse the attribute and rendered "No screen
 * configuration provided".
 *
 * Fix: JSON is now delivered as <script type="application/json"> children,
 * which the HTML parser treats as opaque text. This test locks that in.
 */

import { describe, it, expect } from "vitest";
import { renderWidgetSSR } from "../../../src/routes/universal-login/u2-widget-page";

function extractScript(html: string, key: string): string | null {
  // Script content is opaque to HTML entity decoding — extract the raw text
  // exactly as the browser would expose it via .textContent.
  const re = new RegExp(
    `<script[^>]*data-authhero="${key}"[^>]*>([\\s\\S]*?)</script>`,
    "i",
  );
  const match = html.match(re);
  return match ? match[1]! : null;
}

describe("renderWidgetSSR JSON transport", () => {
  it("round-trips screen JSON whose RICH_TEXT content contains HTML entities", async () => {
    // Mimic the try-connection-result screen: a RICH_TEXT block whose
    // `content` was built with escapeHtml() so it can be safely rendered
    // via innerHTML. The content therefore embeds entities like &quot;,
    // &amp;, &lt;, &#x27; — all of which would be decoded by the HTML
    // parser if the JSON sat in an attribute.
    const screen = {
      name: "try-connection-result",
      action: "",
      method: "POST",
      title: "Try Connection",
      description: "The connection completed successfully.",
      components: [
        {
          id: "try-connection-result",
          type: "RICH_TEXT",
          category: "BLOCK",
          visible: true,
          config: {
            content:
              '<pre><code>{\n  &quot;sub&quot;: &quot;foo&quot;,\n  &quot;email&quot;: &quot;a&amp;b@example.com&quot;,\n  &quot;name&quot;: &quot;O&#x27;Brien &lt;test&gt;&quot;\n}</code></pre>',
          },
          order: 0,
        },
      ],
    };

    const html = await renderWidgetSSR({
      screenId: "try-connection-result",
      screenJson: JSON.stringify(screen),
      state: "abc123",
      authParamsJson: JSON.stringify({ client_id: "test" }),
    });

    // The widget element must not carry JSON as an attribute anymore — those
    // would fail HTML-attribute decoding for any payload with entities.
    expect(html).not.toMatch(/<authhero-widget[^>]*\sscreen='/);
    expect(html).not.toMatch(/<authhero-widget[^>]*\sauth-params='/);

    const screenScript = extractScript(html, "screen");
    expect(screenScript).not.toBeNull();
    const parsed = JSON.parse(screenScript!);
    expect(parsed).toEqual(screen);

    const authScript = extractScript(html, "auth-params");
    expect(authScript).not.toBeNull();
    expect(JSON.parse(authScript!)).toEqual({ client_id: "test" });
  });

  it("neutralizes a literal </script in the JSON payload", async () => {
    // If a screen ever embedded the literal sequence </script in its
    // content, that would close our wrapper script early. We escape it.
    const screen = {
      name: "x",
      action: "",
      method: "POST",
      components: [
        {
          id: "evil",
          type: "RICH_TEXT",
          category: "BLOCK",
          visible: true,
          config: { content: "</script><script>alert(1)</script>" },
          order: 0,
        },
      ],
    };

    const html = await renderWidgetSSR({
      screenId: "x",
      screenJson: JSON.stringify(screen),
      state: "",
      authParamsJson: "{}",
    });

    // Should not contain an unescaped </script>alert breakout.
    expect(html).not.toContain("</script><script>alert(1)");

    const screenScript = extractScript(html, "screen");
    expect(screenScript).not.toBeNull();
    // The wrapper script content must remain valid JSON after extraction.
    // We tolerate the escape (`<\/script`) since JSON.parse treats it as a
    // valid string escape that decodes back to `</script`.
    const parsed = JSON.parse(screenScript!);
    expect(parsed.components[0].config.content).toBe(
      "</script><script>alert(1)</script>",
    );
  });

  it("omits branding/theme scripts when those payloads are absent", async () => {
    const html = await renderWidgetSSR({
      screenId: "login",
      screenJson: JSON.stringify({ name: "login", action: "", method: "POST" }),
      state: "",
      authParamsJson: "{}",
    });
    expect(extractScript(html, "branding")).toBeNull();
    expect(extractScript(html, "theme")).toBeNull();
    expect(extractScript(html, "screen")).not.toBeNull();
    expect(extractScript(html, "auth-params")).not.toBeNull();
  });
});
