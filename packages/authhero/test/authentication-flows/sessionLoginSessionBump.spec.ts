import { describe, it, expect } from "vitest";
import { Context } from "hono";
import { createFrontChannelAuthResponse } from "../../src/authentication-flows/common";
import { getTestServer } from "../helpers/test-server";
import { Bindings, Variables } from "../../src/types";
import { getEnrichedClient } from "../../src/helpers/client";
import { AuthorizationResponseType } from "@authhero/adapter-interfaces";

/**
 * Flow-level (adapter-independent) guarantee: when the login flow creates a new
 * session that outlives its login_session, the login_session expiry must be
 * extended so it isn't reaped while a live session still references it. This is
 * the orphaned-session bug observed in production.
 */
describe("login flow keeps login_session alive when creating a session", () => {
  it("extends the login_session expiry to outlive a newly created session", async () => {
    const { env } = await getTestServer();

    // Tenant with long session lifetimes so the created session outlives the
    // short-lived login_session below.
    await env.data.tenants.update("tenantId", {
      session_lifetime: 24 * 30, // 30 days (hours)
      idle_session_lifetime: 24 * 7, // 7 days (hours)
    });

    const ctx = {
      env,
      var: { tenant_id: "tenantId" },
      req: {
        header: () => {},
        query: () => {},
        queries: () => {},
      },
      header: () => null,
    } as unknown as Context<{ Bindings: Bindings; Variables: Variables }>;

    // Short-lived login_session (5 minutes)
    const loginSession = await env.data.loginSessions.create("tenantId", {
      expires_at: new Date(Date.now() + 1000 * 60 * 5).toISOString(),
      csrf_token: "csrfToken",
      authParams: {
        client_id: "clientId",
        username: "foo@example.com",
        scope: "openid",
        audience: "http://example.com",
        redirect_uri: "http://example.com/callback",
      },
    });

    const expiresBefore = new Date(loginSession.expires_at).getTime();

    const client = await getEnrichedClient(env, "clientId");
    const user = await env.data.users.get("tenantId", "email|userId");
    if (!client || !user) {
      throw new Error("Client or user not found");
    }

    const response = (await createFrontChannelAuthResponse(ctx, {
      authParams: {
        client_id: "clientId",
        response_type: AuthorizationResponseType.CODE,
        scope: "openid",
        redirect_uri: "http://example.com/callback",
      },
      client,
      user,
      loginSession,
    })) as Response;

    expect(response.status).toEqual(302);

    const updatedLoginSession = await env.data.loginSessions.get(
      "tenantId",
      loginSession.id,
    );
    expect(updatedLoginSession?.session_id).toBeTruthy();

    // The created session lives for ~7-30 days, so the login_session must have
    // been extended well past its original 5-minute expiry.
    const createdSession = await env.data.sessions.get(
      "tenantId",
      updatedLoginSession!.session_id!,
    );
    // Guard the expiry math below: without this the `?? 0` fallbacks would let a
    // missing child session pass the comparison vacuously.
    expect(createdSession).toBeTruthy();
    const sessionExpiry = Math.max(
      createdSession?.expires_at
        ? new Date(createdSession.expires_at).getTime()
        : 0,
      createdSession?.idle_expires_at
        ? new Date(createdSession.idle_expires_at).getTime()
        : 0,
    );

    const expiresAfter = new Date(updatedLoginSession!.expires_at).getTime();
    expect(expiresAfter).toBeGreaterThan(expiresBefore);
    expect(expiresAfter).toBeGreaterThanOrEqual(sessionExpiry);
  });
});
