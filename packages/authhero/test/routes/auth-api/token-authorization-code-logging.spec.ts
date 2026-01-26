import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getTestServer } from "../../helpers/test-server";
import { createSessions } from "../../helpers/create-session";
import { LogTypes } from "@authhero/adapter-interfaces";

interface ErrorResponse {
  error: string;
  error_description?: string;
}

describe("authorization_code grant - failed exchange logging", () => {
  it("should log feacft when code is invalid with client_id and message", async () => {
    const { oauthApp, env } = await getTestServer();
    const client = testClient(oauthApp, env);

    const response = await client.oauth.token.$post(
      {
        form: {
          grant_type: "authorization_code",
          code: "invalid-code-12345",
          redirect_uri: "http://localhost:3000/callback",
          client_id: "clientId",
          client_secret: "clientSecret",
        },
      },
      {
        headers: {
          "tenant-id": "tenantId",
        },
      },
    );

    expect(response.status).toBe(403);

    // Check that a log was created
    const { logs } = await env.data.logs.list("tenantId", {
      page: 0,
      per_page: 100,
      include_totals: false,
    });

    const failedExchangeLog = logs.find(
      (log) =>
        log.type ===
        LogTypes.FAILED_EXCHANGE_AUTHORIZATION_CODE_FOR_ACCESS_TOKEN,
    );

    expect(failedExchangeLog).toBeDefined();
    expect(failedExchangeLog?.type).toBe("feacft");
    expect(failedExchangeLog?.description).toBe("Invalid client credentials");
    expect(failedExchangeLog?.client_id).toBe("clientId");
    // No user_id because the code doesn't exist - createLogMessage defaults to empty string
    expect(failedExchangeLog?.user_id).toBe("");
  });

  it("should log feacft when code is expired with user_id and client_id", async () => {
    const { oauthApp, env } = await getTestServer();
    const client = testClient(oauthApp, env);

    // Create the login session and an expired code
    const { loginSession } = await createSessions(env.data);

    await env.data.codes.create("tenantId", {
      code_type: "authorization_code",
      user_id: "email|userId",
      code_id: "expired-code",
      login_id: loginSession.id,
      expires_at: new Date(Date.now() - 1000).toISOString(), // Expired 1 second ago
    });

    const response = await client.oauth.token.$post(
      {
        form: {
          grant_type: "authorization_code",
          code: "expired-code",
          redirect_uri: "http://example.com/callback",
          client_id: "clientId",
          client_secret: "clientSecret",
        },
      },
      {
        headers: {
          "tenant-id": "tenantId",
        },
      },
    );

    expect(response.status).toBe(403);

    // Check that a log was created
    const { logs } = await env.data.logs.list("tenantId", {
      page: 0,
      per_page: 100,
      include_totals: false,
    });

    const failedExchangeLog = logs.find(
      (log) =>
        log.type ===
        LogTypes.FAILED_EXCHANGE_AUTHORIZATION_CODE_FOR_ACCESS_TOKEN,
    );

    expect(failedExchangeLog).toBeDefined();
    expect(failedExchangeLog?.type).toBe("feacft");
    expect(failedExchangeLog?.description).toBe("Code expired");
    expect(failedExchangeLog?.client_id).toBe("clientId");
    expect(failedExchangeLog?.user_id).toBe("email|userId");
  });

  it("should log feacft when authorization code is reused with user_id and client_id", async () => {
    const { oauthApp, env } = await getTestServer();
    const client = testClient(oauthApp, env);

    // Create the login session and code
    const { loginSession } = await createSessions(env.data);

    await env.data.codes.create("tenantId", {
      code_type: "authorization_code",
      user_id: "email|userId",
      code_id: "reuse-code",
      login_id: loginSession.id,
      expires_at: new Date(Date.now() + 1000 * 60 * 5).toISOString(),
    });

    // First request should succeed
    const firstResponse = await client.oauth.token.$post(
      {
        form: {
          grant_type: "authorization_code",
          code: "reuse-code",
          redirect_uri: "http://example.com/callback",
          client_id: "clientId",
          client_secret: "clientSecret",
        },
      },
      {
        headers: {
          "tenant-id": "tenantId",
        },
      },
    );
    expect(firstResponse.status).toBe(200);

    // Second request with the same code should fail
    const secondResponse = await client.oauth.token.$post(
      {
        form: {
          grant_type: "authorization_code",
          code: "reuse-code",
          redirect_uri: "http://example.com/callback",
          client_id: "clientId",
          client_secret: "clientSecret",
        },
      },
      {
        headers: {
          "tenant-id": "tenantId",
        },
      },
    );
    expect(secondResponse.status).toBe(400);
    const secondBody = (await secondResponse.json()) as ErrorResponse;
    expect(secondBody).toEqual({
      error: "invalid_grant",
      error_description: "Invalid authorization code",
    });

    // Check that a log was created for the failed reuse
    const { logs } = await env.data.logs.list("tenantId", {
      page: 0,
      per_page: 100,
      include_totals: false,
    });

    const failedExchangeLog = logs.find(
      (log) =>
        log.type ===
          LogTypes.FAILED_EXCHANGE_AUTHORIZATION_CODE_FOR_ACCESS_TOKEN &&
        log.description === "Invalid authorization code",
    );

    expect(failedExchangeLog).toBeDefined();
    expect(failedExchangeLog?.type).toBe("feacft");
    expect(failedExchangeLog?.description).toBe("Invalid authorization code");
    expect(failedExchangeLog?.client_id).toBe("clientId");
    expect(failedExchangeLog?.user_id).toBe("email|userId");
  });

  it("should log feacft when client_secret is invalid", async () => {
    const { oauthApp, env } = await getTestServer();
    const client = testClient(oauthApp, env);

    // Create the login session and code
    const { loginSession } = await createSessions(env.data);

    await env.data.codes.create("tenantId", {
      code_type: "authorization_code",
      user_id: "email|userId",
      code_id: "valid-code",
      login_id: loginSession.id,
      expires_at: new Date(Date.now() + 1000 * 60 * 5).toISOString(),
    });

    const response = await client.oauth.token.$post(
      {
        form: {
          grant_type: "authorization_code",
          code: "valid-code",
          redirect_uri: "http://example.com/callback",
          client_id: "clientId",
          client_secret: "wrong-secret",
        },
      },
      {
        headers: {
          "tenant-id": "tenantId",
        },
      },
    );

    expect(response.status).toBe(403);

    // Check that a log was created
    const { logs } = await env.data.logs.list("tenantId", {
      page: 0,
      per_page: 100,
      include_totals: false,
    });

    const failedExchangeLog = logs.find(
      (log) =>
        log.type ===
        LogTypes.FAILED_EXCHANGE_AUTHORIZATION_CODE_FOR_ACCESS_TOKEN,
    );

    expect(failedExchangeLog).toBeDefined();
    expect(failedExchangeLog?.type).toBe("feacft");
    expect(failedExchangeLog?.description).toBe("Invalid client credentials");
    expect(failedExchangeLog?.client_id).toBe("clientId");
    expect(failedExchangeLog?.user_id).toBe("email|userId");
  });

  it("should log feacft when PKCE code_verifier is invalid", async () => {
    const { oauthApp, env } = await getTestServer();
    const client = testClient(oauthApp, env);

    const { loginSession } = await createSessions(env.data);

    // Create a code with PKCE challenge
    await env.data.codes.create("tenantId", {
      code_type: "authorization_code",
      user_id: "email|userId",
      code_id: "pkce-code",
      login_id: loginSession.id,
      expires_at: new Date(Date.now() + 1000 * 60 * 5).toISOString(),
      code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM", // SHA256 of "test_verifier"
      code_challenge_method: "S256",
    });

    const response = await client.oauth.token.$post(
      {
        form: {
          grant_type: "authorization_code",
          code: "pkce-code",
          redirect_uri: "http://example.com/callback",
          client_id: "clientId",
          code_verifier: "wrong_verifier_that_does_not_match_challenge",
        },
      },
      {
        headers: {
          "tenant-id": "tenantId",
        },
      },
    );

    expect(response.status).toBe(403);

    // Check that a log was created
    const { logs } = await env.data.logs.list("tenantId", {
      page: 0,
      per_page: 100,
      include_totals: false,
    });

    const failedExchangeLog = logs.find(
      (log) =>
        log.type ===
        LogTypes.FAILED_EXCHANGE_AUTHORIZATION_CODE_FOR_ACCESS_TOKEN,
    );

    expect(failedExchangeLog).toBeDefined();
    expect(failedExchangeLog?.type).toBe("feacft");
    expect(failedExchangeLog?.description).toBe("Invalid client credentials");
    expect(failedExchangeLog?.client_id).toBe("clientId");
    expect(failedExchangeLog?.user_id).toBe("email|userId");
  });

  it("should log feacft when redirect_uri does not match", async () => {
    const { oauthApp, env } = await getTestServer();
    const client = testClient(oauthApp, env);

    const { loginSession } = await createSessions(env.data);

    await env.data.codes.create("tenantId", {
      code_type: "authorization_code",
      user_id: "email|userId",
      code_id: "redirect-code",
      login_id: loginSession.id,
      expires_at: new Date(Date.now() + 1000 * 60 * 5).toISOString(),
      redirect_uri: "http://example.com/callback",
    });

    const response = await client.oauth.token.$post(
      {
        form: {
          grant_type: "authorization_code",
          code: "redirect-code",
          redirect_uri: "http://different.com/callback",
          client_id: "clientId",
          client_secret: "clientSecret",
        },
      },
      {
        headers: {
          "tenant-id": "tenantId",
        },
      },
    );

    expect(response.status).toBe(403);

    // Check that a log was created
    const { logs } = await env.data.logs.list("tenantId", {
      page: 0,
      per_page: 100,
      include_totals: false,
    });

    const failedExchangeLog = logs.find(
      (log) =>
        log.type ===
        LogTypes.FAILED_EXCHANGE_AUTHORIZATION_CODE_FOR_ACCESS_TOKEN,
    );

    expect(failedExchangeLog).toBeDefined();
    expect(failedExchangeLog?.type).toBe("feacft");
    expect(failedExchangeLog?.description).toBe("Invalid redirect uri");
    expect(failedExchangeLog?.client_id).toBe("clientId");
    expect(failedExchangeLog?.user_id).toBe("email|userId");
  });
});
