import { describe, expect, it } from "vitest";
import {
  fromProfileCreateValues,
  fromProfileUpdateValues,
  toProfileFormValues,
  validateJwksJson,
  validateSubjectTokenType,
} from "./formMapping";

const JWKS = { keys: [{ kty: "RSA", kid: "k1", n: "abc", e: "AQAB" }] };

describe("validateSubjectTokenType", () => {
  it("accepts https and urn URIs", () => {
    expect(validateSubjectTokenType("urn:acme:session-token")).toBeUndefined();
    expect(validateSubjectTokenType("https://acme.example/t")).toBeUndefined();
  });

  it("rejects other schemes and reserved namespaces", () => {
    expect(validateSubjectTokenType("http://acme.example")).toBeDefined();
    expect(
      validateSubjectTokenType("urn:ietf:params:oauth:token-type:jwt"),
    ).toBeDefined();
    expect(validateSubjectTokenType("URN:AUTH0:x")).toBeDefined();
    expect(validateSubjectTokenType("urn:okta:x")).toBeDefined();
  });
});

describe("validateJwksJson", () => {
  it("requires a keys array", () => {
    expect(validateJwksJson(JSON.stringify(JWKS))).toBeUndefined();
    expect(validateJwksJson("{}")).toBeDefined();
    expect(validateJwksJson("{not json")).toBeDefined();
  });
});

describe("toProfileFormValues", () => {
  it("derives the mode and key source from the record", () => {
    expect(toProfileFormValues({ action_id: "act_1" })).toMatchObject({
      mode: "action",
      keys_source: "jwks_uri",
    });
    const jwt = toProfileFormValues({
      jwt_verification: { issuer: "https://acme.example", jwks: JWKS },
    });
    expect(jwt.mode).toBe("jwt");
    expect(jwt.keys_source).toBe("jwks");
    expect(JSON.parse(String(jwt.jwks_json))).toEqual(JWKS);
  });
});

describe("fromProfileCreateValues", () => {
  it("sends only the action for an action profile", () => {
    expect(
      fromProfileCreateValues({
        mode: "action",
        name: "P",
        subject_token_type: "urn:acme:p",
        action_id: "act_1",
        jwt_verification: { issuer: "leftover" },
      }),
    ).toEqual({
      name: "P",
      subject_token_type: "urn:acme:p",
      type: "custom_authentication",
      action_id: "act_1",
    });
  });

  it("builds jwt_verification with defaults and drops empty lists", () => {
    expect(
      fromProfileCreateValues({
        mode: "jwt",
        name: "P",
        subject_token_type: "urn:acme:p",
        action_id: "leftover",
        keys_source: "jwks_uri",
        jwt_verification: {
          issuer: " https://acme.example ",
          jwks_uri: "https://acme.example/jwks.json",
          audience: [],
          algorithms: [],
          max_lifetime_seconds: null,
          user_mapping: { type: "connection", connection: "acme" },
        },
      }),
    ).toEqual({
      name: "P",
      subject_token_type: "urn:acme:p",
      type: "custom_authentication",
      jwt_verification: {
        issuer: "https://acme.example",
        jwks_uri: "https://acme.example/jwks.json",
        max_lifetime_seconds: 300,
        require_jti: true,
        user_mapping: {
          type: "connection",
          connection: "acme",
          create_if_not_exists: true,
          trust_email_verified: false,
        },
      },
    });
  });

  it("parses a pasted JWKS and keeps explicit settings", () => {
    const payload = fromProfileCreateValues({
      mode: "jwt",
      keys_source: "jwks",
      jwks_json: JSON.stringify(JWKS),
      jwt_verification: {
        issuer: "https://acme.example",
        jwks_uri: "https://ignored.example",
        audience: ["https://auth.example", " "],
        algorithms: ["ES256"],
        max_lifetime_seconds: 60,
        require_jti: false,
        user_mapping: { type: "user_id", connection: "ignored" },
      },
    });
    expect(payload.jwt_verification).toEqual({
      issuer: "https://acme.example",
      jwks: JWKS,
      audience: ["https://auth.example"],
      algorithms: ["ES256"],
      max_lifetime_seconds: 60,
      require_jti: false,
      user_mapping: { type: "user_id" },
    });
  });
});

describe("fromProfileUpdateValues", () => {
  it("never sends action_id", () => {
    expect(
      fromProfileUpdateValues({
        id: "tep_1",
        name: "P",
        subject_token_type: "urn:acme:p",
        action_id: "act_1",
        type: "custom_authentication",
      }),
    ).toEqual({ name: "P", subject_token_type: "urn:acme:p" });
  });

  it("sends the rebuilt jwt_verification for a declarative profile", () => {
    const payload = fromProfileUpdateValues({
      name: "P",
      subject_token_type: "urn:acme:p",
      keys_source: "jwks_uri",
      jwt_verification: {
        issuer: "https://acme.example",
        jwks: JWKS,
        jwks_uri: "https://acme.example/jwks.json",
        user_mapping: { type: "user_id" },
      },
    });
    expect(payload.jwt_verification).toMatchObject({
      jwks_uri: "https://acme.example/jwks.json",
    });
    expect(payload.jwt_verification).not.toHaveProperty("jwks");
  });
});
