// `h` is the JSX factory Stencil compiles these templates against — used by
// the transform, never referenced by name.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { h } from "@stencil/core";
import { newSpecPage, SpecPage } from "@stencil/core/testing";
import { AuthheroWidget } from "../src/components/authhero-widget/authhero-widget";
import { AuthheroNode } from "../src/components/authhero-node/authhero-node";
import type { UiScreen } from "../src/types/components";

function screenWith(components: UiScreen["components"]): UiScreen {
  return {
    id: "test-step",
    title: "Test",
    action: "/u2/forms/test",
    method: "POST",
    components,
  } as UiScreen;
}

const nextButton = {
  id: "next",
  type: "NEXT_BUTTON",
  config: { text: "Continue" },
};

async function render(screen: UiScreen) {
  const submitted: Array<Record<string, string>> = [];
  const page = await newSpecPage({
    components: [AuthheroWidget, AuthheroNode],
    template: () => (
      <authhero-widget
        screen={screen}
        onFormSubmit={(e: CustomEvent<{ data: Record<string, string> }>) =>
          submitted.push(e.detail.data)
        }
      ></authhero-widget>
    ),
  });
  await page.waitForChanges();
  return { page, submitted };
}

/** The primary action button, rendered inside its own node's shadow root. */
function continueButton(page: SpecPage) {
  const nodes = Array.from(
    page.root!.shadowRoot!.querySelectorAll("authhero-node"),
  );
  for (const node of nodes) {
    const button = node.shadowRoot?.querySelector<HTMLButtonElement>(
      "button[data-primary-action-button]",
    );
    if (button) return button;
  }
  throw new Error("No primary action button rendered");
}

/** mock-doc does not implement the `disabled` IDL property on buttons. */
function isContinueDisabled(page: SpecPage) {
  return continueButton(page).hasAttribute("disabled");
}

/** The first input rendered by the node for the given component id. */
function fieldInput(page: SpecPage, id: string) {
  const nodes = Array.from(
    page.root!.shadowRoot!.querySelectorAll("authhero-node"),
  );
  for (const node of nodes) {
    const input = node.shadowRoot?.querySelector<HTMLInputElement>(
      `input[name="${id}"]`,
    );
    if (input) return input;
  }
  throw new Error(`No input rendered for ${id}`);
}

async function typeInto(page: SpecPage, id: string, value: string) {
  const el = fieldInput(page, id);
  el.value = value;
  el.dispatchEvent(new Event("input"));
  await page.waitForChanges();
}

describe("required fields gate the primary action button", () => {
  it("disables Continue until a required text field is filled", async () => {
    const { page } = await render(
      screenWith([
        { id: "given_name", type: "TEXT", label: "First name", required: true },
        nextButton,
      ] as UiScreen["components"]),
    );

    expect(isContinueDisabled(page)).toBe(true);

    await typeInto(page, "given_name", "Ada");

    expect(isContinueDisabled(page)).toBe(false);
  });

  it("disables Continue again when the field is cleared", async () => {
    const { page } = await render(
      screenWith([
        { id: "given_name", type: "TEXT", label: "First name", required: true },
        nextButton,
      ] as UiScreen["components"]),
    );

    await typeInto(page, "given_name", "Ada");
    await typeInto(page, "given_name", "");

    expect(isContinueDisabled(page)).toBe(true);
  });

  it("treats whitespace as empty", async () => {
    const { page } = await render(
      screenWith([
        { id: "given_name", type: "TEXT", label: "First name", required: true },
        nextButton,
      ] as UiScreen["components"]),
    );

    await typeInto(page, "given_name", "   ");

    expect(isContinueDisabled(page)).toBe(true);
  });

  it("leaves Continue enabled when nothing is required", async () => {
    const { page } = await render(
      screenWith([
        { id: "given_name", type: "TEXT", label: "First name" },
        nextButton,
      ] as UiScreen["components"]),
    );

    expect(isContinueDisabled(page)).toBe(false);
  });

  it("counts a server-supplied default_value as filled", async () => {
    const { page } = await render(
      screenWith([
        {
          id: "given_name",
          type: "TEXT",
          label: "First name",
          required: true,
          config: { default_value: "Ada" },
        },
        nextButton,
      ] as UiScreen["components"]),
    );

    expect(isContinueDisabled(page)).toBe(false);
  });

  it("ignores required fields that are not visible", async () => {
    const { page } = await render(
      screenWith([
        {
          id: "given_name",
          type: "TEXT",
          label: "First name",
          required: true,
          visible: false,
        },
        nextButton,
      ] as UiScreen["components"]),
    );

    expect(isContinueDisabled(page)).toBe(false);
  });

  it("ignores required components the widget does not render", async () => {
    const { page } = await render(
      screenWith([
        { id: "doc", type: "FILE", label: "Passport", required: true },
        nextButton,
      ] as UiScreen["components"]),
    );

    expect(isContinueDisabled(page)).toBe(false);
  });

  it("requires a required LEGAL checkbox to be ticked", async () => {
    const { page } = await render(
      screenWith([
        {
          id: "terms",
          type: "LEGAL",
          required: true,
          config: { text: "I accept the terms" },
        },
        nextButton,
      ] as UiScreen["components"]),
    );

    expect(isContinueDisabled(page)).toBe(true);

    const checkbox = fieldInput(page, "terms");
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event("change"));
    await page.waitForChanges();

    expect(isContinueDisabled(page)).toBe(false);
  });

  it("counts a BOOLEAN ticked by default as filled", async () => {
    const { page } = await render(
      screenWith([
        {
          id: "newsletter",
          type: "BOOLEAN",
          label: "Send me news",
          required: true,
          config: { default_value: true },
        },
        nextButton,
      ] as UiScreen["components"]),
    );

    expect(isContinueDisabled(page)).toBe(false);
    expect(fieldInput(page, "newsletter").checked).toBe(true);
  });

  it("gates again when a BOOLEAN ticked by default is unticked", async () => {
    const { page } = await render(
      screenWith([
        {
          id: "newsletter",
          type: "BOOLEAN",
          label: "Send me news",
          required: true,
          config: { default_value: true },
        },
        nextButton,
      ] as UiScreen["components"]),
    );

    const checkbox = fieldInput(page, "newsletter");
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event("change"));
    await page.waitForChanges();

    expect(fieldInput(page, "newsletter").checked).toBe(false);
    expect(isContinueDisabled(page)).toBe(true);
  });

  it("does not submit on Enter while a required field is empty", async () => {
    const { page, submitted } = await render(
      screenWith([
        { id: "given_name", type: "TEXT", label: "First name", required: true },
        nextButton,
      ] as UiScreen["components"]),
    );

    const el = fieldInput(page, "given_name");
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    await page.waitForChanges();

    expect(submitted).toHaveLength(0);

    await typeInto(page, "given_name", "Ada");
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    await page.waitForChanges();

    expect(submitted).toHaveLength(1);
    expect(submitted[0].given_name).toBe("Ada");
  });

  it("keeps choice-list screens clickable", async () => {
    const { page } = await render(
      screenWith([
        { id: "tenant-a", type: "NEXT_BUTTON", config: { text: "Tenant A" } },
        { id: "tenant-b", type: "NEXT_BUTTON", config: { text: "Tenant B" } },
      ] as UiScreen["components"]),
    );

    expect(isContinueDisabled(page)).toBe(false);
  });
});

describe("BOOLEAN defaults", () => {
  it("submits the default of an untouched checkbox", async () => {
    const { page, submitted } = await render(
      screenWith([
        {
          id: "newsletter",
          type: "BOOLEAN",
          label: "Send me news",
          config: { default_value: true },
        },
        {
          id: "marketing",
          type: "BOOLEAN",
          label: "Marketing",
          config: { default_value: false },
        },
        nextButton,
      ] as UiScreen["components"]),
    );

    continueButton(page).click();
    await page.waitForChanges();

    expect(submitted).toHaveLength(1);
    expect(submitted[0].newsletter).toBe("true");
    expect(submitted[0].marketing).toBe("false");
  });
});
