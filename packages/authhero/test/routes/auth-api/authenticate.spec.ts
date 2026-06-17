import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import bcryptjs from "bcryptjs";
import { getTestServer } from "../../helpers/test-server";
import { USERNAME_PASSWORD_PROVIDER } from "../../../src/constants";
import { Strategy } from "@authhero/adapter-interfaces";

describe("authenticate", () => {
  it("should return a token for a successful login", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    // Create the user
    await env.data.users.create("tenantId", {
      email: "foo2@example.com",
      email_verified: true,
      name: "Test User",
      nickname: "Test User",
      connection: Strategy.USERNAME_PASSWORD,
      provider: USERNAME_PASSWORD_PROVIDER,
      is_social: false,
      user_id: `${USERNAME_PASSWORD_PROVIDER}|userId`,
    });
    // Set the password
    await env.data.passwords.create("tenantId", {
      user_id: `${USERNAME_PASSWORD_PROVIDER}|userId`,
      password: await bcryptjs.hash("Test1234!", 10),
      algorithm: "bcrypt",
    });

    const loginResponse = await oauthClient.co.authenticate.$post({
      json: {
        client_id: "clientId",
        credential_type: "http://auth0.com/oauth/grant-type/password-realm",
        realm: Strategy.USERNAME_PASSWORD,
        password: "Test1234!",
        username: "foo2@example.com",
      },
    });

    expect(loginResponse.status).toEqual(200);
    const { login_ticket } = (await loginResponse.json()) as {
      login_ticket: string;
    };

    expect(login_ticket).toBeTypeOf("string");

    const ticket = await env.data.codes.get("tenantId", login_ticket, "ticket");
    expect(ticket).toBeTypeOf("object");

    // Check the logs — SUCCESS_LOGIN from the post-login hook plus the
    // outer SUCCESS_CROSS_ORIGIN_AUTHENTICATION ("scoa") emitted by /co/authenticate.
    const logsResults = await env.data.logs.list("tenantId");
    expect(logsResults.logs).toHaveLength(2);

    expect(logsResults.logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "s",
          description: expect.stringContaining("Successful login"),
        }),
        expect.objectContaining({
          type: "scoa",
          description: "Successful cross-origin authentication",
        }),
      ]),
    );
  });

  it("should create a log message for a login attempt for a non-existing user", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    const loginResponse = await oauthClient.co.authenticate.$post({
      json: {
        client_id: "clientId",
        credential_type: "http://auth0.com/oauth/grant-type/password-realm",
        realm: Strategy.USERNAME_PASSWORD,
        password: "Test1234!",
        username: "foo2@example.com",
      },
    });

    expect(loginResponse.status).toEqual(403);

    // Inner FAILED_LOGIN_INVALID_EMAIL_USERNAME ("fu") for the unknown user
    // plus the outer FAILED_CROSS_ORIGIN_AUTHENTICATION ("fcoa") from
    // /co/authenticate.
    const { logs } = await env.data.logs.list("tenantId");
    expect(logs).toHaveLength(2);

    expect(logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "fu", description: "Invalid user" }),
        expect.objectContaining({ type: "fcoa" }),
      ]),
    );
  });

  it("should create a log message for a login attempt for incorrect password", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    // Create the user
    await env.data.users.create("tenantId", {
      email: "foo2@example.com",
      email_verified: true,
      name: "Test User",
      nickname: "Test User",
      connection: Strategy.USERNAME_PASSWORD,
      provider: USERNAME_PASSWORD_PROVIDER,
      is_social: false,
      user_id: `${USERNAME_PASSWORD_PROVIDER}|userId`,
    });
    // Set the password
    await env.data.passwords.create("tenantId", {
      user_id: `${USERNAME_PASSWORD_PROVIDER}|userId`,
      password: await bcryptjs.hash("Test1234!", 10),
      algorithm: "bcrypt",
    });

    const loginResponse = await oauthClient.co.authenticate.$post({
      json: {
        client_id: "clientId",
        credential_type: "http://auth0.com/oauth/grant-type/password-realm",
        realm: Strategy.USERNAME_PASSWORD,
        password: "IncorrectPassword",
        username: "foo2@example.com",
      },
    });

    expect(loginResponse.status).toEqual(403);

    const { logs } = await env.data.logs.list("tenantId");

    const [failedLoginLog] = logs;
    expect(failedLoginLog).toMatchObject({
      type: "fp",
      description: "Invalid password",
    });
  });

  it("should reject a login after three failed attempts", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    // Create the user
    await env.data.users.create("tenantId", {
      email: "foo2@example.com",
      email_verified: true,
      name: "Test User",
      nickname: "Test User",
      connection: Strategy.USERNAME_PASSWORD,
      provider: USERNAME_PASSWORD_PROVIDER,
      is_social: false,
      user_id: `${USERNAME_PASSWORD_PROVIDER}|userId`,
    });
    // Set the password
    await env.data.passwords.create("tenantId", {
      user_id: `${USERNAME_PASSWORD_PROVIDER}|userId`,
      password: await bcryptjs.hash("Test1234!", 10),
      algorithm: "bcrypt",
    });

    for (let i = 0; i < 3; i++) {
      const incorrectPasswordResponse = await oauthClient.co.authenticate.$post(
        {
          json: {
            client_id: "clientId",
            credential_type: "http://auth0.com/oauth/grant-type/password-realm",
            realm: Strategy.USERNAME_PASSWORD,
            password: "IncorrectPassword",
            username: "foo2@example.com",
          },
        },
      );

      expect(incorrectPasswordResponse.status).toEqual(403);
    }

    const loginResponse = await oauthClient.co.authenticate.$post({
      json: {
        client_id: "clientId",
        credential_type: "http://auth0.com/oauth/grant-type/password-realm",
        realm: Strategy.USERNAME_PASSWORD,
        password: "Test1234!",
        username: "foo2@example.com",
      },
    });

    expect(loginResponse.status).toEqual(403);

    // 4 attempts × 2 entries each (inner failure + outer
    // FAILED_CROSS_ORIGIN_AUTHENTICATION) = 8 logs.
    const { logs } = await env.data.logs.list("tenantId");
    expect(logs).toHaveLength(8);

    expect(logs[0]).toMatchObject({
      type: "fp",
      description: "Invalid password",
    });
  });
});
