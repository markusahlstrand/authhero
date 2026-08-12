// `h` is the JSX factory Stencil compiles these templates against — used by
// the transform, never referenced by name.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { h } from "@stencil/core";
import { newSpecPage, SpecPage } from "@stencil/core/testing";
import { AuthheroNode } from "../src/components/authhero-node/authhero-node";
import type { FormComponent } from "../src/types/components";

type DateConfig = { format?: string; min?: string; max?: string };

function dateComponent(config?: DateConfig): FormComponent {
  return {
    id: "birthdate",
    type: "DATE",
    label: "Date of birth",
    ...(config ? { config } : {}),
  } as FormComponent;
}

async function renderDate(options?: {
  component?: FormComponent;
  locale?: string;
  value?: string;
}) {
  const emitted: string[] = [];
  const page = await newSpecPage({
    components: [AuthheroNode],
    template: () => (
      <authhero-node
        component={options?.component ?? dateComponent()}
        locale={options?.locale}
        value={options?.value}
        onFieldChange={(e: CustomEvent<{ id: string; value: string }>) =>
          emitted.push(e.detail.value)
        }
      ></authhero-node>
    ),
  });
  await page.waitForChanges();
  return { page, emitted };
}

function segments(page: SpecPage) {
  return Array.from(
    page.root!.shadowRoot!.querySelectorAll("input[data-date-segment]"),
  ) as HTMLInputElement[];
}

function segment(page: SpecPage, name: "day" | "month" | "year") {
  return page.root!.shadowRoot!.querySelector(
    `input[data-date-segment="${name}"]`,
  ) as HTMLInputElement;
}

function submittedValue(page: SpecPage) {
  const hidden = page.root!.shadowRoot!.querySelector(
    'input[type="hidden"]',
  ) as HTMLInputElement;
  return hidden.getAttribute("value");
}

/** Type into a segment one character at a time, as a user would. */
async function type(page: SpecPage, input: HTMLInputElement, text: string) {
  for (const char of text) {
    input.value = input.value + char;
    input.dispatchEvent(new Event("input"));
    await page.waitForChanges();
  }
}

async function blur(page: SpecPage, input: HTMLInputElement) {
  input.dispatchEvent(new Event("blur"));
  await page.waitForChanges();
}

describe("DATE field", () => {
  it("renders three numeric segments instead of a native date input", async () => {
    const { page } = await renderDate();

    expect(
      page.root!.shadowRoot!.querySelector('input[type="date"]'),
    ).toBeNull();

    const inputs = segments(page);
    expect(inputs.length).toBe(3);
    for (const input of inputs) {
      expect(input.getAttribute("inputmode")).toBe("numeric");
    }
  });

  it("orders the segments by locale", async () => {
    const order = async (locale?: string) => {
      const { page } = await renderDate({ locale });
      return segments(page).map((i) => i.getAttribute("data-date-segment"));
    };

    expect(await order("en-GB")).toEqual(["day", "month", "year"]);
    expect(await order("en-US")).toEqual(["month", "day", "year"]);
    expect(await order("sv-SE")).toEqual(["year", "month", "day"]);
    // No locale — day first, matching most of the world
    expect(await order(undefined)).toEqual(["day", "month", "year"]);
  });

  it("shows a format hint per segment that a typed value replaces", async () => {
    const { page } = await renderDate({ locale: "en-GB" });

    expect(segment(page, "day").getAttribute("placeholder")).toBe("DD");
    expect(segment(page, "year").getAttribute("placeholder")).toBe("YYYY");

    await type(page, segment(page, "day"), "15");
    expect(segment(page, "day").value).toBe("15");
  });

  it("emits an ISO date once all three segments are filled", async () => {
    const { page, emitted } = await renderDate({ locale: "en-GB" });

    await type(page, segment(page, "day"), "15");
    await type(page, segment(page, "month"), "03");
    // Nothing submittable until the year is complete
    expect(emitted[emitted.length - 1]).toBe("");

    await type(page, segment(page, "year"), "1985");

    expect(emitted[emitted.length - 1]).toBe("1985-03-15");
    expect(submittedValue(page)).toBe("1985-03-15");
  });

  it("emits the same ISO value whatever the segment order", async () => {
    const { page, emitted } = await renderDate({ locale: "sv-SE" });

    await type(page, segment(page, "year"), "1985");
    await type(page, segment(page, "month"), "03");
    await type(page, segment(page, "day"), "15");

    expect(emitted[emitted.length - 1]).toBe("1985-03-15");
  });

  it("hydrates the segments from an existing value", async () => {
    const { page } = await renderDate({
      locale: "en-GB",
      value: "1990-12-24",
    });

    expect(segment(page, "day").value).toBe("24");
    expect(segment(page, "month").value).toBe("12");
    expect(segment(page, "year").value).toBe("1990");
  });

  it("ignores non-digit input", async () => {
    const { page } = await renderDate({ locale: "en-GB" });

    const day = segment(page, "day");
    day.value = "1a-";
    day.dispatchEvent(new Event("input"));
    await page.waitForChanges();

    expect(day.value).toBe("1");
  });

  it("pads a single digit on blur", async () => {
    const { page, emitted } = await renderDate({ locale: "en-GB" });

    await type(page, segment(page, "year"), "1985");
    await type(page, segment(page, "month"), "3");
    await blur(page, segment(page, "month"));

    expect(segment(page, "month").value).toBe("03");

    await type(page, segment(page, "day"), "5");
    await blur(page, segment(page, "day"));

    expect(segment(page, "day").value).toBe("05");
    expect(emitted[emitted.length - 1]).toBe("1985-03-05");
  });

  it("expands a two-digit year to the last hundred years", async () => {
    const { page } = await renderDate({ locale: "en-GB" });
    const thisYear = new Date().getUTCFullYear();

    await type(page, segment(page, "year"), "85");
    await blur(page, segment(page, "year"));

    expect(segment(page, "year").value).toBe("1985");

    // A year that would land in the future belongs to the previous century
    const future = String((thisYear % 100) + 1).padStart(2, "0");
    const yearInput = segment(page, "year");
    yearInput.value = "";
    await type(page, yearInput, future);
    await blur(page, yearInput);

    expect(Number(segment(page, "year").value)).toBeLessThan(thisYear);
  });

  it("does not second-guess a fully typed year", async () => {
    const { page } = await renderDate({ locale: "en-GB" });

    await type(page, segment(page, "year"), "2024");
    await blur(page, segment(page, "year"));

    expect(segment(page, "year").value).toBe("2024");
  });

  it("submits nothing for a date that does not exist", async () => {
    const { page, emitted } = await renderDate({ locale: "en-GB" });

    await type(page, segment(page, "day"), "31");
    await type(page, segment(page, "month"), "02");
    await type(page, segment(page, "year"), "1985");

    expect(emitted[emitted.length - 1]).toBe("");
    expect(submittedValue(page)).toBe("");
    // ...and says so, rather than looking accepted
    expect(segment(page, "day").getAttribute("aria-invalid")).toBe("true");
  });

  it("does not flag a half-filled date as invalid", async () => {
    const { page } = await renderDate({ locale: "en-GB" });

    await type(page, segment(page, "day"), "15");

    expect(segment(page, "day").getAttribute("aria-invalid")).toBe("false");
  });

  /** Paste `text` into a segment, the way a clipboard drop arrives. */
  async function paste(page: SpecPage, input: HTMLInputElement, text: string) {
    const event = new Event("paste") as Event & {
      clipboardData: { getData: () => string };
    };
    event.clipboardData = { getData: () => text };
    input.dispatchEvent(event);
    await page.waitForChanges();
  }

  it("fills every segment from a pasted date", async () => {
    const { page, emitted } = await renderDate({ locale: "en-GB" });

    await paste(page, segment(page, "day"), "1985-03-15");

    expect(segment(page, "day").value).toBe("15");
    expect(segment(page, "month").value).toBe("03");
    expect(segment(page, "year").value).toBe("1985");
    expect(emitted[emitted.length - 1]).toBe("1985-03-15");
  });

  it("reads a pasted date in the field's own order", async () => {
    const { page, emitted } = await renderDate({ locale: "en-GB" });

    await paste(page, segment(page, "day"), "15/03/1985");

    expect(segment(page, "day").value).toBe("15");
    expect(segment(page, "month").value).toBe("03");
    expect(segment(page, "year").value).toBe("1985");
    expect(emitted[emitted.length - 1]).toBe("1985-03-15");
  });

  it("expands a two-digit year in a pasted date", async () => {
    const { page, emitted } = await renderDate({ locale: "en-GB" });

    await paste(page, segment(page, "day"), "15/03/85");

    expect(segment(page, "day").value).toBe("15");
    expect(segment(page, "month").value).toBe("03");
    expect(segment(page, "year").value).toBe("1985");
    expect(emitted[emitted.length - 1]).toBe("1985-03-15");
  });

  it("honours an explicit format over the locale", async () => {
    const { page } = await renderDate({
      component: dateComponent({ format: "MM/DD/YYYY" }),
      locale: "sv-SE",
    });

    expect(
      segments(page).map((i) => i.getAttribute("data-date-segment")),
    ).toEqual(["month", "day", "year"]);
  });

  it("anchors two-digit years on the field's max when it has one", async () => {
    const { page } = await renderDate({
      component: dateComponent({ max: "2030-12-31" }),
      locale: "en-GB",
    });

    await type(page, segment(page, "year"), "28");
    await blur(page, segment(page, "year"));

    expect(segment(page, "year").value).toBe("2028");
  });
});

describe("DATE field value echo", () => {
  /**
   * The widget mirrors every emitted value back onto the node's `value` prop.
   * A half-typed date emits "", so the echo must not wipe what is on screen.
   */
  async function echoingPage() {
    const { page, emitted } = await renderDate({ locale: "en-GB" });
    const echo = async () => {
      (page.root as unknown as { value?: string }).value =
        emitted[emitted.length - 1];
      await page.waitForChanges();
    };
    return { page, emitted, echo };
  }

  it("keeps the first digit when the parent echoes an empty value back", async () => {
    const { page, echo } = await echoingPage();

    await type(page, segment(page, "day"), "3");
    await echo();

    expect(segment(page, "day").value).toBe("3");
  });

  it("survives an echo after every keystroke", async () => {
    const { page, emitted, echo } = await echoingPage();

    for (const [name, digits] of [
      ["day", "15"],
      ["month", "03"],
      ["year", "1985"],
    ] as const) {
      for (const digit of digits) {
        await type(page, segment(page, name), digit);
        await echo();
      }
    }

    expect(emitted[emitted.length - 1]).toBe("1985-03-15");
    expect(segment(page, "day").value).toBe("15");
    expect(segment(page, "month").value).toBe("03");
    expect(segment(page, "year").value).toBe("1985");
  });

  it("does not re-format a single digit under the caret", async () => {
    const { page, echo } = await echoingPage();

    // "1985-12-3" is already a complete date, so the echo comes back padded
    await type(page, segment(page, "year"), "1985");
    await echo();
    await type(page, segment(page, "month"), "12");
    await echo();
    await type(page, segment(page, "day"), "3");
    await echo();

    // Still "3", so the next digit lands next to it rather than being dropped
    expect(segment(page, "day").value).toBe("3");

    await type(page, segment(page, "day"), "1");
    await echo();

    expect(segment(page, "day").value).toBe("31");
  });

  it("still clears when a complete date is reset externally", async () => {
    const { page } = await renderDate({ locale: "en-GB", value: "1985-03-15" });

    (page.root as unknown as { value?: string }).value = "";
    await page.waitForChanges();

    expect(segment(page, "day").value).toBe("");
    expect(segment(page, "month").value).toBe("");
    expect(segment(page, "year").value).toBe("");
  });

  it("takes on a new date set externally", async () => {
    const { page } = await renderDate({ locale: "en-GB", value: "1985-03-15" });

    (page.root as unknown as { value?: string }).value = "1990-12-24";
    await page.waitForChanges();

    expect(segment(page, "day").value).toBe("24");
    expect(segment(page, "year").value).toBe("1990");
  });
});

describe("DATE field focus movement", () => {
  /**
   * mock-doc does not track focus, so assert on the call the component makes
   * rather than on activeElement.
   */
  function watchFocus(input: HTMLInputElement) {
    const focused = jest.fn();
    input.focus = focused;
    return focused;
  }

  it("advances to the next segment once one is complete", async () => {
    const { page } = await renderDate({ locale: "en-GB" });
    const monthFocused = watchFocus(segment(page, "month"));

    await type(page, segment(page, "day"), "15");

    expect(monthFocused).toHaveBeenCalled();
  });

  it("advances on a digit that cannot start a two-digit value", async () => {
    const { page } = await renderDate({ locale: "en-GB" });
    const monthFocused = watchFocus(segment(page, "month"));

    // No day starts with 4, so "4" is already the whole day
    await type(page, segment(page, "day"), "4");

    expect(monthFocused).toHaveBeenCalled();
  });

  it("stays put while a segment can still take another digit", async () => {
    const { page } = await renderDate({ locale: "en-GB" });
    const monthFocused = watchFocus(segment(page, "month"));

    // "1" could still become 10-19
    await type(page, segment(page, "day"), "1");

    expect(monthFocused).not.toHaveBeenCalled();
  });

  it("submits the screen on Enter in a segment", async () => {
    const clicked: Array<{ id: string }> = [];
    const page = await newSpecPage({
      components: [AuthheroNode],
      template: () => (
        <authhero-node
          component={dateComponent()}
          locale="en-GB"
          onButtonClick={(e: CustomEvent<{ id: string }>) =>
            clicked.push(e.detail)
          }
        ></authhero-node>
      ),
    });
    await page.waitForChanges();

    segment(page, "day").dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    await page.waitForChanges();

    expect(clicked.map((c) => c.id)).toContain("submit");
  });

  it("steps back on backspace in an empty segment", async () => {
    const { page } = await renderDate({ locale: "en-GB" });
    const dayFocused = watchFocus(segment(page, "day"));

    const month = segment(page, "month");
    month.selectionStart = 0;
    month.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Backspace", bubbles: true }),
    );
    await page.waitForChanges();

    expect(dayFocused).toHaveBeenCalled();
  });
});

describe("DATE field range", () => {
  it("does not submit a date before min", async () => {
    const { page, emitted } = await renderDate({
      component: dateComponent({ min: "1900-01-01" }),
      locale: "en-GB",
    });

    await type(page, segment(page, "day"), "15");
    await type(page, segment(page, "month"), "03");
    await type(page, segment(page, "year"), "1885");

    expect(emitted[emitted.length - 1]).toBe("");
    expect(segment(page, "day").getAttribute("aria-invalid")).toBe("true");
  });

  it("does not submit a date after max", async () => {
    const { page, emitted } = await renderDate({
      component: dateComponent({ max: "2010-12-31" }),
      locale: "en-GB",
    });

    await type(page, segment(page, "day"), "15");
    await type(page, segment(page, "month"), "03");
    await type(page, segment(page, "year"), "2015");

    expect(emitted[emitted.length - 1]).toBe("");
  });

  it("submits a date inside the range", async () => {
    const { page, emitted } = await renderDate({
      component: dateComponent({ min: "1900-01-01", max: "2010-12-31" }),
      locale: "en-GB",
    });

    await type(page, segment(page, "day"), "15");
    await type(page, segment(page, "month"), "03");
    await type(page, segment(page, "year"), "1985");

    expect(emitted[emitted.length - 1]).toBe("1985-03-15");
    expect(segment(page, "day").getAttribute("aria-invalid")).toBe("false");
  });
});
