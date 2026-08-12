// `h` is the JSX factory Stencil compiles these templates against — used by
// the transform, never referenced by name.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { h } from "@stencil/core";
import { newSpecPage, SpecPage } from "@stencil/core/testing";
import { AuthheroNode } from "../src/components/authhero-node/authhero-node";
import type { FormComponent } from "../src/types/components";

const telComponent: FormComponent = {
  id: "phone",
  type: "TEL",
  label: "Phone number",
} as FormComponent;

async function renderTel(component: FormComponent = telComponent) {
  const emitted: string[] = [];
  const page = await newSpecPage({
    components: [AuthheroNode],
    template: () => (
      <authhero-node
        component={component}
        onFieldChange={(e: CustomEvent<{ id: string; value: string }>) =>
          emitted.push(e.detail.value)
        }
      ></authhero-node>
    ),
  });
  await page.waitForChanges();
  return { page, emitted };
}

function input(page: SpecPage) {
  return page.root!.shadowRoot!.querySelector("input")!;
}

function select(page: SpecPage) {
  return page.root!.shadowRoot!.querySelector(
    "select.country-select",
  ) as HTMLSelectElement;
}

/** ISO code of the country currently shown in the picker. */
function selectedCountry(page: SpecPage) {
  const options = Array.from(select(page).querySelectorAll("option"));
  return options.find((o) => o.hasAttribute("selected"))?.getAttribute("value");
}

/** Simulate typing a string one character at a time. */
async function type(page: SpecPage, text: string) {
  const el = input(page);
  for (const char of text) {
    el.value = el.value + char;
    el.dispatchEvent(new Event("input"));
    await page.waitForChanges();
  }
}

describe("TEL field country detection", () => {
  it("switches the country when a dial code is typed character by character", async () => {
    const { page, emitted } = await renderTel();

    await type(page, "+46701234567");

    expect(selectedCountry(page)).toBe("SE");
    // The dial code moves into the picker, leaving the local number behind
    expect(input(page).value).toBe("701234567");
    expect(emitted[emitted.length - 1]).toBe("+46701234567");
  });

  it("keeps the partial prefix in the field while it is being typed", async () => {
    const { page, emitted } = await renderTel();

    await type(page, "+4");

    expect(input(page).value).toBe("+4");
    expect(emitted[emitted.length - 1]).toBe("+4");
  });

  it("still accepts the 00 international prefix", async () => {
    const { page } = await renderTel();

    await type(page, "0046701234567");

    expect(selectedCountry(page)).toBe("SE");
    expect(input(page).value).toBe("701234567");
  });

  it("prefixes a local number with the selected country dial code", async () => {
    const { page, emitted } = await renderTel();

    await type(page, "5551234");

    expect(emitted[emitted.length - 1]).toBe("+15551234");
  });

  it("keeps the picked country when the widget echoes the value back", async () => {
    const { page, emitted } = await renderTel();

    // Canada shares "+1" with the US, and the US is the first entry with that
    // dial code — so re-deriving the country from the emitted value would
    // move the user off Canada.
    const countrySelect = select(page);
    countrySelect.value = "CA";
    countrySelect.dispatchEvent(new Event("change"));
    await page.waitForChanges();

    await type(page, "5551234");
    expect(emitted[emitted.length - 1]).toBe("+15551234");

    // The widget mirrors every emitted value back onto the `value` prop.
    (page.root as unknown as { value?: string }).value = "+15551234";
    await page.waitForChanges();

    expect(selectedCountry(page)).toBe("CA");
    expect(input(page).value).toBe("5551234");
  });

  it("replaces a half-typed prefix when a country is picked", async () => {
    const { page, emitted } = await renderTel();

    await type(page, "+4");

    const countrySelect = select(page);
    countrySelect.value = "SE";
    countrySelect.dispatchEvent(new Event("change"));
    await page.waitForChanges();

    expect(input(page).value).toBe("");
    expect(emitted[emitted.length - 1]).toBe("");
  });
});
