import { describe, it, expect } from "vitest";
import { TokenExchangeProfile } from "@authhero/adapter-interfaces";
import { getAdminToken } from "../../helpers/token";
import { getTestServer } from "../../helpers/test-server";

type ListBody = {
  token_exchange_profiles: TokenExchangeProfile[];
  next?: string;
};
type ErrorBody = { message?: string };

const JWKS = {
  keys: [
    {
      kty: "RSA",
      kid: "k1",
      alg: "RS256",
      n: "sXchDaQebHnPiGvyDOAT4saGEUetSyo9MKLOoWFsueri23bOdgWp4Dy1WlUzewbgBHod5pcM9H95GQRV3JDXboIRROSBigeC5yjU1hGzHHyXss8UDprecbAYxknTcQkhslANGRUZmdTOQ5qTRsLAt6BTYuyvVRdhS8exSZEy_c4gs_7svlJJQ4H9_NxsiIoLwAEk7-Q3UXERGYw_75IDrGA84-lA_-Ct4eTlXHBIY2EaV7t7LjJaynVJCpkv4LKjTTAumiGUIuQhrNhZLuF_RJLqHpM2kgWFLU7-VTdL1VbC2tejvcI2BlMkEpk1BzBZI0KQB0GaDWFLN-aEAw3vRw",
      e: "AQAB",
    },
  ],
};

const jwtProfile = {
  name: "Acme sessions",
  subject_token_type: "urn:acme:session-token",
  type: "custom_authentication",
  jwt_verification: {
    issuer: "https://app.acme.test",
    jwks: JWKS,
    user_mapping: {
      type: "connection",
      connection: "Username-Password-Authentication",
    },
  },
};

// Mounted at runtime only when the adapter exposes `tokenExchangeProfiles`,
// so it is absent from the typed hono client. Use raw requests.
describe("management-api token-exchange-profiles", () => {
  async function setup() {
    const { managementApp, env } = await getTestServer();
    const token = await getAdminToken();

    const request = (
      path: string,
      init: { method?: string; body?: unknown } = {},
    ) =>
      managementApp.request(
        `/token-exchange-profiles${path}`,
        {
          method: init.method ?? "GET",
          headers: {
            "tenant-id": "tenantId",
            authorization: `Bearer ${token}`,
            ...(init.body !== undefined
              ? { "content-type": "application/json" }
              : {}),
          },
          ...(init.body !== undefined
            ? { body: JSON.stringify(init.body) }
            : {}),
        },
        env,
      );

    return { env, managementApp, request };
  }

  it("creates, reads, updates and deletes a JWT profile", async () => {
    const { request } = await setup();

    const created = await request("", { method: "POST", body: jwtProfile });
    expect(created.status).toBe(201);
    const profile: TokenExchangeProfile = await created.json();
    expect(profile.id).toMatch(/^tep_/);
    expect(profile).toMatchObject({
      name: "Acme sessions",
      subject_token_type: "urn:acme:session-token",
      type: "custom_authentication",
      jwt_verification: {
        issuer: "https://app.acme.test",
        max_lifetime_seconds: 300,
        require_jti: true,
        user_mapping: {
          type: "connection",
          connection: "Username-Password-Authentication",
          create_if_not_exists: true,
          trust_email_verified: false,
        },
      },
    });

    const fetched = await request(`/${profile.id}`);
    expect(fetched.status).toBe(200);

    const patched = await request(`/${profile.id}`, {
      method: "PATCH",
      body: { name: "Renamed", subject_token_type: "urn:acme:v2" },
    });
    expect(patched.status).toBe(200);
    expect(await patched.json()).toMatchObject({
      name: "Renamed",
      subject_token_type: "urn:acme:v2",
    });

    const deleted = await request(`/${profile.id}`, { method: "DELETE" });
    expect(deleted.status).toBe(204);
    expect((await request(`/${profile.id}`)).status).toBe(404);
  });

  it("pages with from/take and next", async () => {
    const { request } = await setup();
    for (const suffix of ["a", "b", "c"]) {
      const response = await request("", {
        method: "POST",
        body: { ...jwtProfile, subject_token_type: `urn:acme:${suffix}` },
      });
      expect(response.status).toBe(201);
    }

    const first: ListBody = await (await request("?take=2")).json();
    expect(first.token_exchange_profiles).toHaveLength(2);
    expect(first.next).toEqual(expect.any(String));

    const second: ListBody = await (
      await request(`?take=2&from=${first.next}`)
    ).json();
    expect(second.token_exchange_profiles).toHaveLength(1);
    expect(second.next).toBeUndefined();
    expect(second.token_exchange_profiles[0]?.subject_token_type).toBe(
      "urn:acme:c",
    );
  });

  it("rejects a duplicate subject_token_type with 409", async () => {
    const { request } = await setup();
    expect(
      (await request("", { method: "POST", body: jwtProfile })).status,
    ).toBe(201);
    const duplicate = await request("", { method: "POST", body: jwtProfile });
    expect(duplicate.status).toBe(409);
  });

  it.each([
    [
      "neither action_id nor jwt_verification",
      { ...jwtProfile, jwt_verification: undefined },
      "exactly one of action_id and jwt_verification",
    ],
    [
      "both action_id and jwt_verification",
      { ...jwtProfile, action_id: "act_123" },
      "exactly one of action_id and jwt_verification",
    ],
    [
      "both jwks and jwks_uri",
      {
        ...jwtProfile,
        jwt_verification: {
          ...jwtProfile.jwt_verification,
          jwks_uri: "https://app.acme.test/jwks.json",
        },
      },
      "exactly one of jwks and jwks_uri",
    ],
    [
      "an http jwks_uri",
      {
        ...jwtProfile,
        jwt_verification: {
          ...jwtProfile.jwt_verification,
          jwks: undefined,
          jwks_uri: "http://app.acme.test/jwks.json",
        },
      },
      "must use https",
    ],
    [
      "an unknown connection",
      {
        ...jwtProfile,
        jwt_verification: {
          ...jwtProfile.jwt_verification,
          user_mapping: { type: "connection", connection: "nope" },
        },
      },
      "Connection 'nope' does not exist",
    ],
    [
      "an unknown action",
      { ...jwtProfile, jwt_verification: undefined, action_id: "act_missing" },
      "Action 'act_missing' does not exist",
    ],
  ])("rejects %s", async (_label, body, message) => {
    const { request } = await setup();
    const response = await request("", { method: "POST", body });
    expect(response.status).toBe(400);
    const error: ErrorBody = await response.json();
    expect(error.message).toContain(message);
  });

  it.each([
    "urn:ietf:params:oauth:token-type:jwt",
    "urn:auth0:x",
    "acme-token",
  ])("rejects the subject_token_type %s", async (subjectTokenType) => {
    const { request } = await setup();
    const response = await request("", {
      method: "POST",
      body: { ...jwtProfile, subject_token_type: subjectTokenType },
    });
    expect(response.status).toBe(400);
  });

  it("requires the action to support the custom-token-exchange trigger", async () => {
    const { env, request } = await setup();
    const loginAction = await env.data.actions.create("tenantId", {
      name: "login",
      code: "exports.onExecutePostLogin = async () => {};",
      supported_triggers: [{ id: "post-login" }],
    });
    const exchangeAction = await env.data.actions.create("tenantId", {
      name: "exchange",
      code: "exports.onExecuteCustomTokenExchange = async () => {};",
      supported_triggers: [{ id: "custom-token-exchange" }],
    });
    const base = {
      name: "Via action",
      subject_token_type: "urn:acme:action",
      type: "custom_authentication",
    };

    const wrongTrigger = await request("", {
      method: "POST",
      body: { ...base, action_id: loginAction.id },
    });
    expect(wrongTrigger.status).toBe(400);

    const ok = await request("", {
      method: "POST",
      body: { ...base, action_id: exchangeAction.id },
    });
    expect(ok.status).toBe(201);
    const profile: TokenExchangeProfile = await ok.json();

    // The mode is fixed at creation.
    const switchMode = await request(`/${profile.id}`, {
      method: "PATCH",
      body: { jwt_verification: jwtProfile.jwt_verification },
    });
    expect(switchMode.status).toBe(400);
  });

  it("keeps an action alive while a profile uses it", async () => {
    const { env, managementApp, request } = await setup();
    const action = await env.data.actions.create("tenantId", {
      name: "exchange",
      code: "exports.onExecuteCustomTokenExchange = async () => {};",
      supported_triggers: [{ id: "custom-token-exchange" }],
    });
    const created = await request("", {
      method: "POST",
      body: {
        name: "Via action",
        subject_token_type: "urn:acme:action",
        type: "custom_authentication",
        action_id: action.id,
      },
    });
    const profile: TokenExchangeProfile = await created.json();
    const token = await getAdminToken();
    const deleteAction = () =>
      managementApp.request(
        `/actions/actions/${action.id}`,
        {
          method: "DELETE",
          headers: {
            "tenant-id": "tenantId",
            authorization: `Bearer ${token}`,
          },
        },
        env,
      );

    expect((await deleteAction()).status).toBe(409);
    await request(`/${profile.id}`, { method: "DELETE" });
    expect((await deleteAction()).status).toBe(200);
  });
});
