import { describe, it, expect } from "vitest";
import { renderDefaultTemplate } from "../../src/emails/render";

describe("renderDefaultTemplate", () => {
  it("renders the bundled reset_email default with branding + url vars", async () => {
    const out = await renderDefaultTemplate("reset_email", {
      tenant: { friendly_name: "Acme", support_url: "https://acme.test/help" },
      branding: { logo: "https://cdn.test/logo.png", primary_color: "#ff00aa" },
      url: "https://login.acme.test/reset?ticket=abc",
      password_reset_title: "Reset your password",
      reset_password_email_click_to_reset: "Click to reset",
      reset_password_email_reset: "Reset",
      support_info: "Need help?",
      contact_us: "Contact us",
      copyright: "(c) Acme",
    });
    expect(out).not.toBeNull();
    expect(out!.subject).toBe("Reset your password");
    expect(out!.html).toContain("Reset your password");
    expect(out!.html).toContain("https://login.acme.test/reset?ticket=abc");
    expect(out!.html).toContain("#ff00aa");
    expect(out!.html).toContain("https://cdn.test/logo.png");
    expect(out!.html).toContain("(c) Acme");
  });

});
