import { describe, expect, it } from "vitest";
import { testClient } from "hono/testing";
import { getTestServer } from "../../helpers/test-server";
import { getAdminToken } from "../../helpers/token";

interface ErrorResponse {
  error: string;
  error_description: string;
}

async function startPasswordless(
  server: Awaited<ReturnType<typeof getTestServer>>,
  email: string,
) {
  const { oauthApp, managementApp, env, getSentEmails } = server;
  const oauthClient = testClient(oauthApp, env);
  const managementClient = testClient(managementApp, env);

  const token = await getAdminToken();
  await managementClient.email.providers.$post(
    {
      header: { "tenant-id": "tenantId" },
      json: { name: "mock-email", credentials: { api_key: "apiKey" } },
    },
    { headers: { authorization: `Bearer ${token}` } },
  );

  const response = await oauthClient.passwordless.start.$post(
    {
      json: {
        client_id: "clientId",
        connection: "email",
        email,
        send: "code",
        authParams: { scope: "openid profile email" },
      },
    },
    { headers: { "x-real-ip": "1.2.3.4", "user-agent": "Mozilla/5.0" } },
  );
  expect(response.status).toBe(200);

  const emails = await getSentEmails();
  const code = emails[emails.length - 1]?.data.code;
  if (!code) {
    throw new Error("No code found in email");
  }
  return code;
}

async function exchangeOtp(
  server: Awaited<ReturnType<typeof getTestServer>>,
  email: string,
  code: string,
) {
  const { oauthApp, env } = server;
  const oauthClient = testClient(oauthApp, env);

  return oauthClient.oauth.token.$post(
    {
      form: {
        grant_type: "http://auth0.com/oauth/grant-type/passwordless/otp",
        otp: code,
        client_id: "clientId",
        realm: "email",
        username: email,
      },
    },
    { headers: { "tenant-id": "tenantId" } },
  );
}

describe("client.grant_types legacy admin ids", () => {
  it("allows the OTP grant when grant_types holds the legacy 'passwordless_otp' id", async () => {
    const server = await getTestServer({ testTenantLanguage: "en" });

    await server.env.data.clients.update("tenantId", "clientId", {
      grant_types: ["authorization_code", "refresh_token", "passwordless_otp"],
    });

    const email = "legacy-id@example.com";
    const code = await startPasswordless(server, email);
    const response = await exchangeOtp(server, email, code);

    expect(response.status).toBe(200);
  });

  it("allows the OTP grant when grant_types holds the full Auth0 URI", async () => {
    const server = await getTestServer({ testTenantLanguage: "en" });

    await server.env.data.clients.update("tenantId", "clientId", {
      grant_types: ["http://auth0.com/oauth/grant-type/passwordless/otp"],
    });

    const email = "full-uri@example.com";
    const code = await startPasswordless(server, email);
    const response = await exchangeOtp(server, email, code);

    expect(response.status).toBe(200);
  });

  it("still rejects the OTP grant when grant_types lists other grants only", async () => {
    const server = await getTestServer({ testTenantLanguage: "en" });

    await server.env.data.clients.update("tenantId", "clientId", {
      grant_types: ["authorization_code", "refresh_token"],
    });

    const email = "not-allowed@example.com";
    const code = await startPasswordless(server, email);
    const response = await exchangeOtp(server, email, code);

    expect(response.status).toBe(400);
    const body = (await response.json()) as ErrorResponse;
    expect(body.error).toBe("unauthorized_client");
  });
});
