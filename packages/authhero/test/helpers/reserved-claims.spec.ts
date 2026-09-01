import { describe, it, expect } from "vitest";
import { Context } from "hono";
import { testClient } from "hono/testing";
import { AuthorizationResponseType } from "@authhero/adapter-interfaces";
import { getTestServer } from "./test-server";
import { createToken } from "./token";
import { createAuthTokens } from "../../src/authentication-flows/common";
import { getEnrichedClient } from "../../src/helpers/client";
import { getPrimaryUserByEmail } from "../../src/helpers/users";
import { parseJWT } from "../../src/utils/jwt";
import { Bindings, Variables } from "../../src/types";
import {
  ACCESS_TOKEN_RESERVED_CLAIMS,
  ID_TOKEN_RESERVED_CLAIMS,
  applyCustomClaim,
  isReservedClaim,
} from "../../src/helpers/reserved-claims";
import {
  HookEvent,
  OnExecuteCredentialsExchangeAPI,
} from "../../src/types/Hooks";

/**
 * Names the mint computes and hooks must not be able to rewrite. Every one of
 * these used to be writable through at least one of the three custom-claim
 * write paths.
 */
const NEWLY_RESERVED_ACCESS_TOKEN_CLAIMS = [
  "scope",
  "tenant_id",
  "sid",
  "act",
  "org_id",
  "org_name",
  "permissions",
  "requested_userinfo_claims",
  "client_id",
  "azp",
  "auth_time",
  "acr",
  "amr",
  "gty",
];

async function makeTokenParams(env: Bindings) {
  const client = await getEnrichedClient(env, "clientId");
  const user = await getPrimaryUserByEmail({
    userAdapter: env.data.users,
    tenant_id: "tenantId",
    email: "foo@example.com",
  });
  if (!client || !user) {
    throw new Error("Client or user not found");
  }
  return { client, user };
}

function makeCtx(env: Bindings) {
  return {
    env,
    var: { tenant_id: "tenantId" },
    // The hook event carries the request method/url, and logMessage reads the
    // raw headers — stub just enough of it to run the mint outside a request.
    req: {
      method: "POST",
      url: "http://localhost:3000/oauth/token",
      raw: new Request("http://localhost:3000/oauth/token", { method: "POST" }),
      queries: () => ({}),
      header: () => undefined,
    },
    set: () => {},
  } as unknown as Context<{ Bindings: Bindings; Variables: Variables }>;
}

describe("reserved claims", () => {
  describe("the shared sets", () => {
    it("covers the JWT-spec names plus every server-owned access-token claim", () => {
      for (const claim of [
        "sub",
        "iss",
        "aud",
        "exp",
        "nbf",
        "iat",
        "jti",
        ...NEWLY_RESERVED_ACCESS_TOKEN_CLAIMS,
      ]) {
        expect(isReservedClaim(claim, "access_token")).toBe(true);
      }
    });

    it("reserves the ID-token-only claims on top of the access-token set", () => {
      for (const claim of ["nonce", "at_hash", "c_hash", "s_hash"]) {
        expect(isReservedClaim(claim, "id_token")).toBe(true);
        // These are meaningless on an access token, so they stay writable there.
        expect(isReservedClaim(claim, "access_token")).toBe(false);
      }
      for (const claim of ACCESS_TOKEN_RESERVED_CLAIMS) {
        expect(isReservedClaim(claim, "id_token")).toBe(true);
      }
      expect(ID_TOKEN_RESERVED_CLAIMS.length).toBeGreaterThan(
        ACCESS_TOKEN_RESERVED_CLAIMS.length,
      );
    });

    it("is a superset of the three lists it replaced", () => {
      // authentication-flows/common.ts
      for (const claim of ["sub", "iss", "aud", "exp", "nbf", "iat", "jti"]) {
        expect(isReservedClaim(claim, "access_token")).toBe(true);
      }
      // helpers/service-token.ts — RESERVED_CLAIMS
      for (const claim of [
        "sub",
        "iss",
        "aud",
        "exp",
        "nbf",
        "iat",
        "jti",
        "scope",
        "tenant_id",
      ]) {
        expect(isReservedClaim(claim, "service_token")).toBe(true);
      }
      // helpers/service-token.ts — CLIENT_RESERVED_CLAIMS adds azp
      expect(isReservedClaim("azp", "client_service_token")).toBe(true);
      // …while internal auth-service mints deliberately keep azp writable.
      expect(isReservedClaim("azp", "service_token")).toBe(false);
    });

    it("drops reserved claims and keeps the rest", () => {
      const payload: Record<string, unknown> = {};
      expect(
        applyCustomClaim(payload, "tenant_id", "other", {
          kind: "access_token",
          source: "test",
        }),
      ).toBe(false);
      expect(
        applyCustomClaim(payload, "department", "sales", {
          kind: "access_token",
          source: "test",
        }),
      ).toBe(true);
      expect(payload).toEqual({ department: "sales" });
    });
  });

  describe("createAuthTokens — params.customClaims", () => {
    it("drops reserved names and keeps the values the grant computed", async () => {
      const { env } = await getTestServer();
      const ctx = makeCtx(env);
      const { client, user } = await makeTokenParams(env);

      const tokens = await createAuthTokens(ctx, {
        authParams: {
          client_id: "clientId",
          response_type: AuthorizationResponseType.TOKEN,
          audience: "https://example.com",
          scope: "openid profile",
        },
        client,
        user,
        session_id: "session_id",
        customClaims: {
          scope: "admin:everything",
          permissions: ["admin"],
          tenant_id: "other-tenant",
          sid: "other-session",
          act: { sub: "someone-else" },
          org_id: "org_evil",
          sub: "someone-else",
          department: "sales",
        },
      });

      const payload = parseJWT(tokens.access_token)!.payload as Record<
        string,
        unknown
      >;
      expect(payload.scope).toBe("openid profile");
      expect(payload.tenant_id).toBe("tenantId");
      expect(payload.sid).toBe("session_id");
      expect(payload.sub).toBe(user.user_id);
      expect(payload.act).toBeUndefined();
      expect(payload.org_id).toBeUndefined();
      expect(payload.permissions).toBeUndefined();
      // Non-reserved claims on the same call still land.
      expect(payload.department).toBe("sales");
    });
  });

  describe("unsafeAllowAzpCustomClaim — the transitional escape hatch", () => {
    it("releases azp on every payload that reserves it, and nothing else", () => {
      const allow = { allowAzpOverride: true };

      for (const kind of [
        "access_token",
        "id_token",
        "client_service_token",
      ] as const) {
        expect(isReservedClaim("azp", kind)).toBe(true);
        expect(isReservedClaim("azp", kind, allow)).toBe(false);
        // The flag is about `azp` alone — everything else stays locked.
        expect(isReservedClaim("tenant_id", kind, allow)).toBe(true);
        expect(isReservedClaim("sub", kind, allow)).toBe(true);
        expect(isReservedClaim("scope", kind, allow)).toBe(true);
      }
    });

    it("writes the hook's azp onto the access token when the flag is set", async () => {
      const { env } = await getTestServer();
      env.unsafeAllowAzpCustomClaim = true;
      const ctx = makeCtx(env);
      const { client, user } = await makeTokenParams(env);

      env.hooks = {
        onExecuteCredentialsExchange: async (
          _event: HookEvent,
          api: OnExecuteCredentialsExchangeAPI,
        ) => {
          api.accessToken.setCustomClaim("azp", "vendor-123");
          // Still fenced off: the flag names one claim, not a bypass.
          api.accessToken.setCustomClaim("tenant_id", "other-tenant");
          api.accessToken.setCustomClaim("scope", "admin:everything");
        },
      };

      const tokens = await createAuthTokens(ctx, {
        authParams: {
          client_id: "clientId",
          response_type: AuthorizationResponseType.TOKEN,
          audience: "https://example.com",
          scope: "openid profile",
        },
        client,
        user,
        session_id: "session_id",
      });

      const payload = parseJWT(tokens.access_token)!.payload as Record<
        string,
        unknown
      >;
      expect(payload.azp).toBe("vendor-123");
      expect(payload.tenant_id).toBe("tenantId");
      expect(payload.scope).toBe("openid profile");
    });

    it("drops the hook's azp when the flag is absent", async () => {
      const { env } = await getTestServer();
      const ctx = makeCtx(env);
      const { client, user } = await makeTokenParams(env);

      env.hooks = {
        onExecuteCredentialsExchange: async (
          _event: HookEvent,
          api: OnExecuteCredentialsExchangeAPI,
        ) => {
          api.accessToken.setCustomClaim("azp", "vendor-123");
        },
      };

      const tokens = await createAuthTokens(ctx, {
        authParams: {
          client_id: "clientId",
          response_type: AuthorizationResponseType.TOKEN,
          audience: "https://example.com",
          scope: "openid profile",
        },
        client,
        user,
        session_id: "session_id",
      });

      // The mint never emits `azp` itself, so reserving it removes the claim
      // outright rather than restoring a server-computed value — which is the
      // whole reason the flag exists.
      const payload = parseJWT(tokens.access_token)!.payload as Record<
        string,
        unknown
      >;
      expect(payload.azp).toBeUndefined();
    });

    it("also releases azp through the params.customClaims path", async () => {
      const { env } = await getTestServer();
      env.unsafeAllowAzpCustomClaim = true;
      const ctx = makeCtx(env);
      const { client, user } = await makeTokenParams(env);

      const tokens = await createAuthTokens(ctx, {
        authParams: {
          client_id: "clientId",
          response_type: AuthorizationResponseType.TOKEN,
          audience: "https://example.com",
          scope: "openid profile",
        },
        client,
        user,
        session_id: "session_id",
        customClaims: { azp: "vendor-123", tenant_id: "other-tenant" },
      });

      const payload = parseJWT(tokens.access_token)!.payload as Record<
        string,
        unknown
      >;
      expect(payload.azp).toBe("vendor-123");
      expect(payload.tenant_id).toBe("tenantId");
    });
  });

  describe("credentials-exchange hooks — setCustomClaim", () => {
    it("cannot overwrite an access-token claim the grant computed", async () => {
      const { env } = await getTestServer();
      const ctx = makeCtx(env);
      const { client, user } = await makeTokenParams(env);

      env.hooks = {
        onExecuteCredentialsExchange: async (
          _event: HookEvent,
          api: OnExecuteCredentialsExchangeAPI,
        ) => {
          for (const claim of [
            "sub",
            "iss",
            "aud",
            "exp",
            ...NEWLY_RESERVED_ACCESS_TOKEN_CLAIMS,
          ]) {
            api.accessToken.setCustomClaim(claim, "hijacked");
          }
          api.accessToken.setCustomClaim("department", "sales");
        },
      };

      const tokens = await createAuthTokens(ctx, {
        authParams: {
          client_id: "clientId",
          response_type: AuthorizationResponseType.TOKEN,
          audience: "https://example.com",
          scope: "openid profile",
        },
        client,
        user,
        session_id: "session_id",
      });

      const payload = parseJWT(tokens.access_token)!.payload as Record<
        string,
        unknown
      >;
      for (const claim of NEWLY_RESERVED_ACCESS_TOKEN_CLAIMS) {
        expect(payload[claim]).not.toBe("hijacked");
      }
      expect(payload.sub).toBe(user.user_id);
      expect(payload.iss).toBe("http://localhost:3000/");
      expect(payload.aud).toBe("https://example.com");
      expect(payload.scope).toBe("openid profile");
      expect(payload.tenant_id).toBe("tenantId");
      expect(payload.department).toBe("sales");
    });

    it("cannot overwrite nonce or the token hashes on the id token", async () => {
      const { env } = await getTestServer();
      const ctx = makeCtx(env);
      const { client, user } = await makeTokenParams(env);

      env.hooks = {
        onExecuteCredentialsExchange: async (
          _event: HookEvent,
          api: OnExecuteCredentialsExchangeAPI,
        ) => {
          for (const claim of [
            "nonce",
            "at_hash",
            "c_hash",
            "s_hash",
            "sub",
            "sid",
            "act",
            "auth_time",
          ]) {
            api.idToken.setCustomClaim(claim, "hijacked");
          }
          api.idToken.setCustomClaim("department", "sales");
        },
      };

      const tokens = await createAuthTokens(ctx, {
        authParams: {
          client_id: "clientId",
          response_type: AuthorizationResponseType.TOKEN_ID_TOKEN,
          audience: "https://example.com",
          scope: "openid",
          nonce: "the-rp-nonce",
        },
        client,
        user,
        session_id: "session_id",
      });

      const payload = parseJWT(tokens.id_token!)!.payload as Record<
        string,
        unknown
      >;
      expect(payload.nonce).toBe("the-rp-nonce");
      expect(payload.sub).toBe(user.user_id);
      expect(payload.sid).toBe("session_id");
      expect(payload.act).toBeUndefined();
      // at_hash is computed after the hooks run; it must be the real hash.
      expect(payload.at_hash).toEqual(expect.any(String));
      expect(payload.at_hash).not.toBe("hijacked");
      expect(payload.department).toBe("sales");
    });

    it("cannot forge the RFC 8693 act claim", async () => {
      const { env } = await getTestServer();
      const ctx = makeCtx(env);
      const { client, user } = await makeTokenParams(env);

      env.hooks = {
        onExecuteCredentialsExchange: async (
          _event: HookEvent,
          api: OnExecuteCredentialsExchangeAPI,
        ) => {
          api.accessToken.setCustomClaim("act", { sub: "other-user" });
        },
      };

      const tokens = await createAuthTokens(ctx, {
        authParams: {
          client_id: "clientId",
          response_type: AuthorizationResponseType.TOKEN,
          audience: "https://example.com",
          scope: "openid",
        },
        client,
        user,
        session_id: "session_id",
      });

      const payload = parseJWT(tokens.access_token)!.payload as Record<
        string,
        unknown
      >;
      expect(payload.act).toBeUndefined();
    });

    it("still records the act claim the grant set for an impersonation", async () => {
      const { env } = await getTestServer();
      const ctx = makeCtx(env);
      const { client, user } = await makeTokenParams(env);

      env.hooks = {
        onExecuteCredentialsExchange: async (
          _event: HookEvent,
          api: OnExecuteCredentialsExchangeAPI,
        ) => {
          api.accessToken.setCustomClaim("act", { sub: "other-user" });
        },
      };

      const tokens = await createAuthTokens(ctx, {
        authParams: {
          client_id: "clientId",
          response_type: AuthorizationResponseType.TOKEN,
          audience: "https://example.com",
          scope: "openid",
        },
        client,
        user,
        session_id: "session_id",
        actClient: { client_id: "the-actor-client" },
      });

      const payload = parseJWT(tokens.access_token)!.payload as Record<
        string,
        unknown
      >;
      expect(payload.act).toEqual({
        sub: "the-actor-client",
        client_id: "the-actor-client",
      });
    });
  });

  describe("/userinfo — onFetchUserInfo", () => {
    it("cannot override the subject of the response", async () => {
      const { oauthApp, env } = await getTestServer();
      const client = testClient(oauthApp, env);

      env.hooks = {
        onFetchUserInfo: async (_event, api) => {
          api.setCustomClaim("sub", "someone-else");
          api.setCustomClaim("department", "sales");
        },
      };

      const accessToken = await createToken({
        user_id: "email|userId",
        tenant_id: "tenantId",
        scope: "openid email",
      });

      const response = await client.userinfo.$get(
        {},
        { headers: { authorization: `Bearer ${accessToken}` } },
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body.sub).toBe("email|userId");
      expect(body.department).toBe("sales");
    });

    it("cannot override the subject on the POST variant either", async () => {
      const { oauthApp, env } = await getTestServer();
      const client = testClient(oauthApp, env);

      env.hooks = {
        onFetchUserInfo: async (_event, api) => {
          api.setCustomClaim("sub", "someone-else");
        },
      };

      const accessToken = await createToken({
        user_id: "email|userId",
        tenant_id: "tenantId",
        scope: "openid email",
      });

      const response = await client.userinfo.$post(
        // @ts-expect-error - testClient requires both form and json
        { form: { access_token: accessToken } },
        { headers: { "tenant-id": "tenantId" } },
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body.sub).toBe("email|userId");
    });
  });
});
