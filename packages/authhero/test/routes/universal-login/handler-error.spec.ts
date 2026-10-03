import { describe, it, expect } from "vitest";
import type { UiScreen } from "@authhero/adapter-interfaces";
import { withHandlerError } from "../../../src/routes/universal-login/screens/handler-error";

function screen(overrides: Partial<UiScreen> = {}): UiScreen {
  return {
    action: "/u2/signup",
    method: "POST",
    components: [
      {
        id: "re_password",
        type: "PASSWORD",
        category: "FIELD",
        visible: true,
      },
      {
        id: "submit",
        type: "NEXT_BUTTON",
        category: "BLOCK",
        visible: true,
        config: { text: "Continue" },
      },
    ],
    ...overrides,
  };
}

describe("withHandlerError", () => {
  it("adds the error as a screen-level message when nothing else shows one", () => {
    const result = withHandlerError(screen(), "Something went wrong");

    expect(result.messages).toEqual([
      { text: "Something went wrong", type: "error" },
    ]);
  });

  it("keeps existing non-error messages", () => {
    const result = withHandlerError(
      screen({ messages: [{ text: "Code sent", type: "info" }] }),
      "Something went wrong",
    );

    expect(result.messages).toEqual([
      { text: "Code sent", type: "info" },
      { text: "Something went wrong", type: "error" },
    ]);
  });

  it("does not duplicate an error already shown on a field", () => {
    const input = screen({
      components: [
        {
          id: "re_password",
          type: "PASSWORD",
          category: "FIELD",
          visible: true,
          messages: [{ text: "Lösenorden matchar inte", type: "error" }],
        },
      ],
    });

    const result = withHandlerError(input, "Lösenorden matchar inte");

    expect(result).toBe(input);
    expect(result.messages).toBeUndefined();
  });

  it("does not duplicate an error already shown at screen level", () => {
    const input = screen({
      messages: [{ text: "Failed to delete account", type: "error" }],
    });

    const result = withHandlerError(input, "Failed to delete account");

    expect(result.messages).toEqual([
      { text: "Failed to delete account", type: "error" },
    ]);
  });
});
