import { describe, it, expect } from "vitest";
import { getClientShape } from "./shape";

const confidentialInteractive = {
  showSecret: true,
  showCallbacks: true,
  isExternallyManaged: false,
};

describe("getClientShape", () => {
  it("treats an undefined record as a regular web app", () => {
    expect(getClientShape(undefined)).toEqual(confidentialInteractive);
  });

  it("treats a record without app_type as a regular web app", () => {
    expect(getClientShape({})).toEqual(confidentialInteractive);
  });

  it("treats regular_web as a confidential interactive client", () => {
    expect(getClientShape({ app_type: "regular_web" })).toEqual(
      confidentialInteractive,
    );
  });

  it("hides the secret but shows callbacks for spa", () => {
    expect(getClientShape({ app_type: "spa" })).toEqual({
      showSecret: false,
      showCallbacks: true,
      isExternallyManaged: false,
    });
  });

  it("hides the secret but shows callbacks for native", () => {
    expect(getClientShape({ app_type: "native" })).toEqual({
      showSecret: false,
      showCallbacks: true,
      isExternallyManaged: false,
    });
  });

  it("shows the secret but hides callbacks for non_interactive (M2M)", () => {
    expect(getClientShape({ app_type: "non_interactive" })).toEqual({
      showSecret: true,
      showCallbacks: false,
      isExternallyManaged: false,
    });
  });

  it("falls back to the regular web shape for unknown app types", () => {
    expect(getClientShape({ app_type: "something_new" })).toEqual(
      confidentialInteractive,
    );
  });

  it("marks CIMD clients as externally managed with no secret", () => {
    expect(getClientShape({ client_metadata: { cimd: "true" } })).toEqual({
      showSecret: false,
      showCallbacks: true,
      isExternallyManaged: true,
    });
  });

  it("lets the CIMD flag win over app_type", () => {
    expect(
      getClientShape({
        app_type: "non_interactive",
        client_metadata: { cimd: "true" },
      }),
    ).toEqual({
      showSecret: false,
      showCallbacks: true,
      isExternallyManaged: true,
    });
  });

  it("only treats the exact string 'true' as CIMD", () => {
    expect(
      getClientShape({ client_metadata: { cimd: "false" } })
        .isExternallyManaged,
    ).toBe(false);
    expect(
      getClientShape({ client_metadata: { cimd: true } }).isExternallyManaged,
    ).toBe(false);
    expect(getClientShape({ client_metadata: null }).isExternallyManaged).toBe(
      false,
    );
  });
});
