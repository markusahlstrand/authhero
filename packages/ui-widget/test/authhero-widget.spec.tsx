import { newSpecPage, SpecPage } from "@stencil/core/testing";
import { AuthheroWidget } from "../src/components/authhero-widget/authhero-widget";
import { AuthheroNode } from "../src/components/authhero-node/authhero-node";
import { screens } from "./fixtures";

describe("authhero-widget", () => {
  it("renders login screen from JSON string prop", async () => {
    const page = await newSpecPage({
      components: [AuthheroWidget, AuthheroNode],
      html: `<authhero-widget screen='${JSON.stringify(screens.login)}'></authhero-widget>`,
    });

    await page.waitForChanges();

    expect(page.root).toMatchSnapshot();
    // Widget renders authhero-node children in its shadow DOM
    const nodeElements =
      page.root!.shadowRoot!.querySelectorAll("authhero-node");
    expect(nodeElements.length).toBe(screens.login.components.length);
  });

  it("renders login with social providers", async () => {
    // Escape for HTML attribute (single quotes break with apostrophe in "Don't")
    const screenJson = JSON.stringify(screens.loginWithSocial).replace(
      /'/g,
      "&#39;",
    );
    const page = await newSpecPage({
      components: [AuthheroWidget, AuthheroNode],
      html: `<authhero-widget screen='${screenJson}'></authhero-widget>`,
    });

    await page.waitForChanges();

    expect(page.root).toMatchSnapshot();
    // Check for social buttons
    const nodeElements =
      page.root!.shadowRoot!.querySelectorAll("authhero-node");
    expect(nodeElements.length).toBeGreaterThan(0);
  });

  it("displays error message when present", async () => {
    const page = await newSpecPage({
      components: [AuthheroWidget, AuthheroNode],
      html: `<authhero-widget screen='${JSON.stringify(screens.loginError)}'></authhero-widget>`,
    });

    await page.waitForChanges();

    const errorEl = page.root!.shadowRoot!.querySelector(".message-error");
    expect(errorEl).not.toBeNull();
    expect(errorEl!.textContent).toContain("Invalid credentials");
  });

  it("renders signup screen with all fields", async () => {
    const page = await newSpecPage({
      components: [AuthheroWidget, AuthheroNode],
      html: `<authhero-widget screen='${JSON.stringify(screens.signup)}'></authhero-widget>`,
    });

    await page.waitForChanges();

    expect(page.root).toMatchSnapshot();
    // Count the components
    const nodeElements =
      page.root!.shadowRoot!.querySelectorAll("authhero-node");
    expect(nodeElements.length).toBe(screens.signup.components.length);
  });

  it("renders MFA TOTP screen", async () => {
    const page = await newSpecPage({
      components: [AuthheroWidget, AuthheroNode],
      html: `<authhero-widget screen='${JSON.stringify(screens.mfaTotp)}'></authhero-widget>`,
    });

    await page.waitForChanges();

    expect(page.root).toMatchSnapshot();
  });

  it("renders forgot password screen", async () => {
    const page = await newSpecPage({
      components: [AuthheroWidget, AuthheroNode],
      html: `<authhero-widget screen='${JSON.stringify(screens.forgotPassword)}'></authhero-widget>`,
    });

    await page.waitForChanges();

    expect(page.root).toMatchSnapshot();
  });

  it("renders success screen", async () => {
    const page = await newSpecPage({
      components: [AuthheroWidget, AuthheroNode],
      html: `<authhero-widget screen='${JSON.stringify(screens.success)}'></authhero-widget>`,
    });

    await page.waitForChanges();

    expect(page.root).toMatchSnapshot();
    const successMsg = page.root!.shadowRoot!.querySelector(".message-success");
    expect(successMsg).not.toBeNull();
  });

  it("applies custom branding from fixture", async () => {
    const page = await newSpecPage({
      components: [AuthheroWidget, AuthheroNode],
      html: `<authhero-widget screen='${JSON.stringify(screens.brandedLogin)}'></authhero-widget>`,
    });

    await page.waitForChanges();

    expect(page.root).toMatchSnapshot();
    const container = page.root!.shadowRoot!.querySelector(".widget-container");
    expect(container).not.toBeNull();
  });

  it("shows empty state when no screen provided", async () => {
    const page = await newSpecPage({
      components: [AuthheroWidget, AuthheroNode],
      html: `<authhero-widget></authhero-widget>`,
    });

    await page.waitForChanges();

    const errorMessage = page.root!.shadowRoot!.querySelector(".error-message");
    expect(errorMessage).not.toBeNull();
    expect(errorMessage!.textContent).toContain(
      "No screen configuration provided",
    );
  });

  it("shows loading state", async () => {
    const page = await newSpecPage({
      components: [AuthheroWidget, AuthheroNode],
      html: `<authhero-widget loading="true"></authhero-widget>`,
    });

    await page.waitForChanges();

    const spinner = page.root!.shadowRoot!.querySelector(".loading-spinner");
    expect(spinner).not.toBeNull();
  });

  it("renders screen title", async () => {
    const page = await newSpecPage({
      components: [AuthheroWidget, AuthheroNode],
      html: `<authhero-widget screen='${JSON.stringify(screens.login)}'></authhero-widget>`,
    });

    await page.waitForChanges();

    const title = page.root!.shadowRoot!.querySelector(".title");
    expect(title).not.toBeNull();
    expect(title!.textContent).toBe(screens.login.title);
  });

  it("renders links from meta", async () => {
    const page = await newSpecPage({
      components: [AuthheroWidget, AuthheroNode],
      html: `<authhero-widget screen='${JSON.stringify(screens.login)}'></authhero-widget>`,
    });

    await page.waitForChanges();

    const links = page.root!.shadowRoot!.querySelector(".links");
    expect(links).not.toBeNull();
    const linkElements = links!.querySelectorAll("a");
    expect(linkElements.length).toBe(screens.login.links?.length || 0);
  });

  it("emits screenChange event on initial load", async () => {
    const screenChangeSpy = jest.fn();

    const page = await newSpecPage({
      components: [AuthheroWidget, AuthheroNode],
      html: `<authhero-widget></authhero-widget>`,
    });

    page.root!.addEventListener("screenChange", screenChangeSpy);

    // Update the screen attribute
    page.root!.setAttribute("screen", JSON.stringify(screens.login));
    await page.waitForChanges();

    expect(screenChangeSpy).toHaveBeenCalled();
  });

  it("renders form element", async () => {
    const page = await newSpecPage({
      components: [AuthheroWidget, AuthheroNode],
      html: `<authhero-widget screen='${JSON.stringify(screens.login)}'></authhero-widget>`,
    });

    await page.waitForChanges();

    const form = page.root!.shadowRoot!.querySelector("form");
    expect(form).not.toBeNull();
  });

  it("navigates instead of fetching for GET-method screens", async () => {
    const page = await newSpecPage({
      components: [AuthheroWidget, AuthheroNode],
      html: `<authhero-widget auto-submit="true" screen='${JSON.stringify(screens.success)}'></authhero-widget>`,
    });

    await page.waitForChanges();

    // Mock fetch to detect if it's called
    const fetchSpy = jest.fn();
    (global as any).fetch = fetchSpy;

    // Mock window.location.href
    const locationHref = jest.fn();
    Object.defineProperty(page.win, "location", {
      value: { href: "http://localhost/" },
      writable: true,
    });
    Object.defineProperty(page.win.location, "href", {
      set: locationHref,
      get: () => "http://localhost/",
    });

    // Find the submit button and click it
    const form = page.root!.shadowRoot!.querySelector("form");
    expect(form).not.toBeNull();
    form!.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );

    await page.waitForChanges();

    // Should navigate via location.href, not fetch
    expect(locationHref).toHaveBeenCalledWith(screens.success.action);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("updates data-screen attribute when screen prop changes", async () => {
    const loginScreen = { ...screens.login, name: "login" };
    const signupScreen = { ...screens.signup, name: "signup" };

    const page = await newSpecPage({
      components: [AuthheroWidget, AuthheroNode],
      html: `<authhero-widget screen='${JSON.stringify(loginScreen)}'></authhero-widget>`,
    });

    await page.waitForChanges();

    // data-screen should reflect the screen name from the initial screen
    expect(page.root!.getAttribute("data-screen")).toBe("login");

    // Simulate client-side navigation by changing the screen prop
    page.root!.setAttribute("screen", JSON.stringify(signupScreen));
    await page.waitForChanges();

    // data-screen should update to reflect the new screen's name
    expect(page.root!.getAttribute("data-screen")).toBe("signup");
  });

  it("renders a CODE field as a segmented one-time-code input", async () => {
    const codeScreen = {
      title: "Enter your code",
      action: "http://localhost/verify",
      method: "POST",
      components: [
        {
          id: "code",
          type: "CODE",
          category: "FIELD",
          visible: true,
          label: "Verification code",
          config: { length: 6, mode: "numeric" },
          required: true,
          order: 0,
        },
      ],
    };

    const page = await newSpecPage({
      components: [AuthheroWidget, AuthheroNode],
      html: `<authhero-widget screen='${JSON.stringify(codeScreen)}'></authhero-widget>`,
    });

    await page.waitForChanges();

    const node = page.root!.shadowRoot!.querySelector("authhero-node");
    const nodeShadow = node!.shadowRoot!;

    // Single real input carrying the OTP affordances.
    const input = nodeShadow.querySelector(
      "input.code-input",
    ) as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.getAttribute("autocomplete")).toBe("one-time-code");
    expect(input.getAttribute("inputmode")).toBe("numeric");
    expect(input.getAttribute("maxlength")).toBe("6");
    expect(input.getAttribute("name")).toBe("code");

    // One presentational box per character.
    const boxes = nodeShadow.querySelectorAll(".code-box");
    expect(boxes.length).toBe(6);

    // Laid out as two groups of three with a separator between them.
    const groups = nodeShadow.querySelectorAll(".code-group");
    expect(groups.length).toBe(2);
    expect(groups[0].querySelectorAll(".code-box").length).toBe(3);
    const separators = nodeShadow.querySelectorAll(".code-separator");
    expect(separators.length).toBe(1);

    // No field label is rendered above the boxes (the input keeps an aria-label).
    expect(nodeShadow.querySelector(".input-label")).toBeNull();
    expect(input.getAttribute("aria-label")).toBe("Verification code");
  });

  it("strips non-matching characters and emits the cleaned code value", async () => {
    const fieldChangeSpy = jest.fn();
    const page = await newSpecPage({
      components: [AuthheroNode],
      html: `<authhero-node></authhero-node>`,
    });

    const node = page.root as HTMLElement & {
      component: unknown;
    };
    node.component = {
      id: "code",
      type: "CODE",
      category: "FIELD",
      visible: true,
      config: { length: 6, mode: "numeric" },
      required: true,
      order: 0,
    };
    page.root!.addEventListener("fieldChange", (e) =>
      fieldChangeSpy((e as CustomEvent).detail),
    );
    await page.waitForChanges();

    const input = page.root!.shadowRoot!.querySelector(
      "input.code-input",
    ) as HTMLInputElement;
    input.value = "12a3-4";
    input.dispatchEvent(new Event("input"));

    expect(fieldChangeSpy).toHaveBeenCalledWith({ id: "code", value: "1234" });
    // The visible value is sanitized in place too.
    expect(input.value).toBe("1234");
  });
});
