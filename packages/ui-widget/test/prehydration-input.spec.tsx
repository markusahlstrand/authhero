// `h` is the JSX factory Stencil compiles these templates against — used by
// the transform, never referenced by name.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { h } from "@stencil/core";
import { newSpecPage, SpecPage } from "@stencil/core/testing";
import { AuthheroWidget } from "../src/components/authhero-widget/authhero-widget";
import { AuthheroNode } from "../src/components/authhero-node/authhero-node";
import type { UiScreen } from "../src/types/components";

const screen = {
  id: "login",
  title: "Login",
  action: "/u2/login",
  method: "POST",
  components: [
    {
      id: "email",
      type: "EMAIL",
      config: { default_value: "old@example.com" },
    },
    { id: "next", type: "NEXT_BUTTON", config: { text: "Continue" } },
  ],
} as UiScreen;

async function render() {
  const page = await newSpecPage({
    components: [AuthheroWidget, AuthheroNode],
    template: () => <authhero-widget screen={screen}></authhero-widget>,
  });
  await page.waitForChanges();
  return page;
}

function emailInput(page: SpecPage) {
  for (const node of Array.from(
    page.root!.shadowRoot!.querySelectorAll("authhero-node"),
  )) {
    const input = node.shadowRoot?.querySelector<HTMLInputElement>(
      'input[name="email"]',
    );
    if (input) return input;
  }
  throw new Error("No email input rendered");
}

// Simulates text entered into the server-rendered input before the client
// bundle attached its `onInput` handler: the DOM value changes, no event fires.
function adopt(page: SpecPage, value: string) {
  emailInput(page).value = value;
  const widget: AuthheroWidget = page.rootInstance;
  widget["adoptPrehydrationValues"](screen);
  return widget.formData;
}

describe("pre-hydration input adoption", () => {
  it("keeps a value typed before hydration", async () => {
    const page = await render();
    expect(adopt(page, "typed@example.com").email).toBe("typed@example.com");
  });

  it("keeps a prefilled default the user cleared before hydration", async () => {
    const page = await render();
    expect(page.rootInstance.formData.email).toBe("old@example.com");
    expect(adopt(page, "").email).toBe("");
  });
});
