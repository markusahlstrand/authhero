import { describe, it, expect } from "vitest";
import { Context } from "hono";
import {
  createAuthResponse,
  createAuthTokens,
} from "../../src/authentication-flows/common";
import { getTestServer } from "../helpers/test-server";
import { Bindings, Variables } from "../../src/types";
import { getPrimaryUserByEmail } from "../../src/helpers/users";
import { AuthorizationResponseType } from "@authhero/adapter-interfaces";

describe("common", () => {
  describe("createAuthTokens", () => {
    it("should create an access token when the response type is token", async () => {
      const { env } = await getTestServer();
      const ctx = {
        env,
        var: {
          tenant_id: "tenantId",
        },
      } as Context<{
        Bindings: Bindings;
        Variables: Variables;
      }>;

      const client = await env.data.clients.get("clientId");
      const user = await getPrimaryUserByEmail({
        userAdapter: env.data.users,
        tenant_id: "tenantId",
        email: "foo@example.com",
      });

      if (!client || !user) {
        throw new Error("Client or user not found");
      }

      const tokens = await createAuthTokens(ctx, {
        authParams: {
          client_id: "clientId",
          response_type: AuthorizationResponseType.TOKEN,
        },
        client,
        user,
        session_id: "session_id",
      });

      expect(tokens).toMatchObject({
        access_token: expect.any(String),
        id_token: undefined,
        token_type: "Bearer",
        expires_in: 86400,
      });
    });

    it("should create an access token and an id token when the response type is token id_token and the openid scope is requested", async () => {
      const { env } = await getTestServer();
      const ctx = {
        env,
        var: {
          tenant_id: "tenantId",
        },
      } as Context<{
        Bindings: Bindings;
        Variables: Variables;
      }>;

      const client = await env.data.clients.get("clientId");
      const user = await getPrimaryUserByEmail({
        userAdapter: env.data.users,
        tenant_id: "tenantId",
        email: "foo@example.com",
      });

      if (!client || !user) {
        throw new Error("Client or user not found");
      }

      const tokens = await createAuthTokens(ctx, {
        authParams: {
          client_id: "clientId",
          response_type: AuthorizationResponseType.TOKEN_ID_TOKEN,
          scope: "openid",
        },
        client,
        user,
        session_id: "session_id",
      });

      expect(tokens).toMatchObject({
        access_token: expect.any(String),
        id_token: expect.any(String),
        token_type: "Bearer",
        expires_in: 86400,
      });
    });
  });

  it("should create a code when the response type is code", async () => {
    const { env } = await getTestServer();
    const ctx = {
      env,
      var: {
        tenant_id: "tenantId",
      },
      req: {
        header: () => {},
        queries: () => {},
      },
    } as unknown as Context<{
      Bindings: Bindings;
      Variables: Variables;
    }>;

    // Create the login session and code
    const loginSession = await env.data.loginSessions.create("tenantId", {
      expires_at: new Date(Date.now() + 1000 * 60 * 5).toISOString(),
      csrf_token: "csrfToken",
      authParams: {
        client_id: "clientId",
        username: "foo@example.com",
        scope: "",
        audience: "http://example.com",
        redirect_uri: "http://example.com/callback",
      },
    });

    const client = await env.data.clients.get("clientId");
    const user = await getPrimaryUserByEmail({
      userAdapter: env.data.users,
      tenant_id: "tenantId",
      email: "foo@example.com",
    });

    if (!client || !user) {
      throw new Error("Client or user not found");
    }

    const autResponse = await createAuthResponse(ctx, {
      authParams: {
        client_id: "clientId",
        response_type: AuthorizationResponseType.CODE,
        scope: "openid",
        redirect_uri: "http://example.com/callback",
      },
      client,
      user,
      loginSession,
    });

    expect(autResponse.status).toEqual(302);
    const location = autResponse.headers.get("location");
    if (!location) {
      throw new Error("No location header");
    }

    const redirectUri = new URL(location);
    const codeQuerystring = redirectUri.searchParams.get("code");

    const code = await env.data.codes.get(
      "tenantId",
      codeQuerystring!,
      "authorization_code",
    );
    expect(code).toMatchObject({
      code_id: codeQuerystring,
      code_type: "authorization_code",
      user_id: "email|userId",
    });
  });
});
