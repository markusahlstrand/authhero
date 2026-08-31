import { describe, it, expect } from "vitest";
import {
  fromActionFormValues,
  toActionFormValues,
  type ActionRecord,
} from "./formMapping";

const SENTINEL = "__authhero_unchanged_secret_test__";

describe("toActionFormValues", () => {
  it("derives trigger_id from supported_triggers", () => {
    const record: ActionRecord = {
      id: "act_1",
      name: "addRole",
      supported_triggers: [{ id: "credentials-exchange", version: "v2" }],
    };

    expect(toActionFormValues(record, SENTINEL).trigger_id).toBe(
      "credentials-exchange",
    );
  });

  it("keeps an explicit trigger_id over the supported_triggers entry", () => {
    const record: ActionRecord = {
      trigger_id: "post-login",
      supported_triggers: [{ id: "credentials-exchange" }],
    };

    expect(toActionFormValues(record, SENTINEL).trigger_id).toBe("post-login");
  });

  it("leaves trigger_id undefined when the action has no triggers", () => {
    expect(
      toActionFormValues({ name: "a" }, SENTINEL).trigger_id,
    ).toBeUndefined();
  });

  it("replaces secret values with the sentinel", () => {
    const values = toActionFormValues(
      { secrets: [{ name: "API_KEY", value: "s3cret" }] },
      SENTINEL,
    );

    expect(values.secrets).toEqual([{ name: "API_KEY", value: SENTINEL }]);
  });
});

describe("fromActionFormValues", () => {
  it("writes the selected trigger back as supported_triggers", () => {
    const payload = fromActionFormValues(
      {
        name: "addRole",
        trigger_id: "pre-user-registration",
        supported_triggers: [{ id: "post-login", version: "v3" }],
      },
      SENTINEL,
    );

    expect(payload.supported_triggers).toEqual([
      { id: "pre-user-registration" },
    ]);
    expect(payload.trigger_id).toBeUndefined();
  });

  it("keeps the stored trigger entry, and its version, when unchanged", () => {
    const payload = fromActionFormValues(
      {
        trigger_id: "post-login",
        supported_triggers: [{ id: "post-login", version: "v3" }],
      },
      SENTINEL,
    );

    expect(payload.supported_triggers).toEqual([
      { id: "post-login", version: "v3" },
    ]);
  });

  it("round-trips a record whose trigger the user did not touch", () => {
    const record: ActionRecord = {
      id: "act_1",
      tenant_id: "t1",
      created_at: "2024-01-01T00:00:00.000Z",
      updated_at: "2024-01-02T00:00:00.000Z",
      status: "built",
      deployed_at: "2024-01-02T00:00:00.000Z",
      name: "addRole",
      supported_triggers: [{ id: "credentials-exchange" }],
    };

    const payload = fromActionFormValues(
      toActionFormValues(record, SENTINEL),
      SENTINEL,
    );

    expect(payload.supported_triggers).toEqual([
      { id: "credentials-exchange" },
    ]);
    expect(payload.id).toBeUndefined();
    expect(payload.tenant_id).toBeUndefined();
    expect(payload.status).toBeUndefined();
    expect(payload.deployed_at).toBeUndefined();
  });

  it("omits supported_triggers when neither the form nor the record has one", () => {
    const payload = fromActionFormValues({ name: "addRole" }, SENTINEL);

    expect("supported_triggers" in payload).toBe(false);
  });

  it("drops the value of untouched secrets and keeps edited ones", () => {
    const payload = fromActionFormValues(
      {
        secrets: [
          { name: "UNCHANGED", value: SENTINEL },
          { name: "EDITED", value: "new-value" },
          { name: "", value: "dropped" },
        ],
      },
      SENTINEL,
    );

    expect(payload.secrets).toEqual([
      { name: "UNCHANGED" },
      { name: "EDITED", value: "new-value" },
    ]);
  });
});
