import { describe, it, expect } from "vitest";
import { Context } from "hono";
import {
  createAuthTokens,
  createSession,
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
        sid: "session_id",
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
        sid: "session_id",
      });

      expect(tokens).toMatchObject({
        access_token: expect.any(String),
        id_token: expect.any(String),
        token_type: "Bearer",
        expires_in: 86400,
      });
    });
  });

  describe("createSession", () => {
    it("should create a session", async () => {
      const { env } = await getTestServer();
      const ctx = { env } as Context<{
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

      const result = await createSession(ctx, user, client);

      expect(result).toMatchObject({
        session_id: expect.any(String),
        user_id: user.user_id,
        client_id: client.id,
        expires_at: expect.any(String),
        used_at: expect.any(String),
      });
    });
  });

  //   describe("createAuthResponse", () => {
  //     it("should create an auth response with tokens", async () => {
  //       const session = { session_id: "session_id" };
  //       const tokens = { access_token: "access_token", id_token: "id_token" };
  //       ctx.env.data.sessions.create.mockResolvedValue(session);

  //       const response = await createAuthResponse(ctx, {
  //         authParams,
  //         client,
  //         loginSession: { login_id: "login_id" },
  //         user,
  //         sid,
  //       });

  //       expect(response.status).toBe(302);
  //       expect(response.headers.get("set-cookie")).toBe("cookie");
  //       expect(response.headers.get("location")).toContain(
  //         "https://redirect.example.com",
  //       );
  //     });

  //     it("should create an auth response with web message", async () => {
  //       const session = { session_id: "session_id" };
  //       const tokens = { access_token: "access_token", id_token: "id_token" };
  //       ctx.env.data.sessions.create.mockResolvedValue(session);

  //       authParams.response_mode = "web_message";

  //       const response = await createAuthResponse(ctx, {
  //         authParams,
  //         client,
  //         loginSession: { login_id: "login_id" },
  //         user,
  //         sid,
  //       });

  //       expect(ctx.json).toHaveBeenCalledWith(tokens, {
  //         headers: expect.any(Headers),
  //       });
  //     });
  //   });
});
