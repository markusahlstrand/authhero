import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import bcryptjs from "bcryptjs";
import { getTestServer } from "../../helpers/test-server";

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
      connection: "Username-Password-Authentication",
      provider: "auth2",
      is_social: false,
      user_id: "auth2|userId",
    });
    // Set the password
    await env.data.passwords.create("tenantId", {
      user_id: "auth2|userId",
      password: await bcryptjs.hash("Test1234!", 10),
      algorithm: "bcrypt",
    });

    const loginResponse = await oauthClient.co.authenticate.$post({
      json: {
        client_id: "clientId",
        credential_type: "http://auth0.com/oauth/grant-type/password-realm",
        realm: "Username-Password-Authentication",
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

    // Check the logs
    const logsResults = await env.data.logs.list("tenantId");
    expect(logsResults.logs).toHaveLength(1);

    const [successfulLoginLog] = logsResults.logs;
    expect(successfulLoginLog).toMatchObject({
      type: "s",
      description: "Successful login",
    });
  });

  it("should create a log message for a login attempt for a non-existing user", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    const loginResponse = await oauthClient.co.authenticate.$post({
      json: {
        client_id: "clientId",
        credential_type: "http://auth0.com/oauth/grant-type/password-realm",
        realm: "Username-Password-Authentication",
        password: "Test1234!",
        username: "foo2@example.com",
      },
    });

    expect(loginResponse.status).toEqual(403);

    const logsResults = await env.data.logs.list("tenantId");
    expect(logsResults).toHaveLength(1);

    const [failedLoginLog] = logsResults.logs;
    expect(failedLoginLog).toMatchObject({
      type: "fp",
      description: "Invalid user",
    });
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
      connection: "Username-Password-Authentication",
      provider: "auth2",
      is_social: false,
      user_id: "auth2|userId",
    });
    // Set the password
    await env.data.passwords.create("tenantId", {
      user_id: "auth2|userId",
      password: await bcryptjs.hash("Test1234!", 10),
      algorithm: "bcrypt",
    });

    const loginResponse = await oauthClient.co.authenticate.$post({
      json: {
        client_id: "clientId",
        credential_type: "http://auth0.com/oauth/grant-type/password-realm",
        realm: "Username-Password-Authentication",
        password: "IncorrectPassword",
        username: "foo2@example.com",
      },
    });

    expect(loginResponse.status).toEqual(403);

    const logsResults = await env.data.logs.list("tenantId");
    expect(logsResults).toHaveLength(1);

    const [failedLoginLog] = logsResults.logs;
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
      connection: "Username-Password-Authentication",
      provider: "auth2",
      is_social: false,
      user_id: "auth2|userId",
    });
    // Set the password
    await env.data.passwords.create("tenantId", {
      user_id: "auth2|userId",
      password: await bcryptjs.hash("Test1234!", 10),
      algorithm: "bcrypt",
    });

    for (let i = 0; i < 3; i++) {
      const incorrectPasswordResponse = await oauthClient.co.authenticate.$post(
        {
          json: {
            client_id: "clientId",
            credential_type: "http://auth0.com/oauth/grant-type/password-realm",
            realm: "Username-Password-Authentication",
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
        realm: "Username-Password-Authentication",
        password: "Test1234!",
        username: "foo2@example.com",
      },
    });

    expect(loginResponse.status).toEqual(403);

    const logsResults = await env.data.logs.list("tenantId");
    expect(logsResults).toHaveLength(4);

    const [failedLoginLog] = logsResults.logs;
    expect(failedLoginLog).toMatchObject({
      type: "fp",
      description: "Invalid password",
    });
  });
});
