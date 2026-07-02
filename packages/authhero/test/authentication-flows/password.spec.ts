import { describe, it, expect } from "vitest";
import { getTestServer } from "../helpers/test-server";
import { testClient } from "hono/testing";
import bcryptjs from "bcryptjs";
import { USERNAME_PASSWORD_PROVIDER } from "../../src/constants";
import { Strategy } from "@authhero/adapter-interfaces";

describe("password authentication - failed login tracking", () => {
  it("should reject a login after three failed attempts and record in user_activity", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    // Create the user
    await env.data.users.create("tenantId", {
      email: "testuser@example.com",
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
      password: await bcryptjs.hash("CorrectPassword123!", 10),
      algorithm: "bcrypt",
    });

    // Record 3 failed attempts
    for (let i = 0; i < 3; i++) {
      const incorrectPasswordResponse = await oauthClient.co.authenticate.$post(
        {
          json: {
            client_id: "clientId",
            credential_type: "http://auth0.com/oauth/grant-type/password-realm",
            realm: Strategy.USERNAME_PASSWORD,
            password: "IncorrectPassword",
            username: "testuser@example.com",
          },
        },
      );

      expect(incorrectPasswordResponse.status).toEqual(403);
    }

    // User should now be blocked
    const blockedResponse = await oauthClient.co.authenticate.$post({
      json: {
        client_id: "clientId",
        credential_type: "http://auth0.com/oauth/grant-type/password-realm",
        realm: Strategy.USERNAME_PASSWORD,
        password: "CorrectPassword123!",
        username: "testuser@example.com",
      },
    });

    expect(blockedResponse.status).toEqual(403);

    // Verify the strikes were recorded in user_activity
    const activity = await env.data.userActivity.get(
      "tenantId",
      `${USERNAME_PASSWORD_PROVIDER}|userId`,
    );
    expect(activity?.failed_logins).toBeDefined();
    expect(Array.isArray(activity?.failed_logins)).toBe(true);
    expect(activity?.failed_logins?.length).toBeGreaterThanOrEqual(3);

    // All timestamps should be parseable ISO 8601 strings
    activity?.failed_logins?.forEach((ts) => {
      expect(typeof ts).toBe("string");
      expect(Number.isNaN(Date.parse(ts))).toBe(false);
    });

    // The users row is no longer touched on failed attempts
    const user = await env.data.users.get(
      "tenantId",
      `${USERNAME_PASSWORD_PROVIDER}|userId`,
    );
    expect(user?.app_metadata?.failed_logins).toBeUndefined();
  });

  it("should clear failed_logins after successful login", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    // Create the user
    await env.data.users.create("tenantId", {
      email: "testuser2@example.com",
      email_verified: true,
      name: "Test User 2",
      nickname: "Test User 2",
      connection: Strategy.USERNAME_PASSWORD,
      provider: USERNAME_PASSWORD_PROVIDER,
      is_social: false,
      user_id: `${USERNAME_PASSWORD_PROVIDER}|userId2`,
    });
    // Set the password
    await env.data.passwords.create("tenantId", {
      user_id: `${USERNAME_PASSWORD_PROVIDER}|userId2`,
      password: await bcryptjs.hash("CorrectPassword123!", 10),
      algorithm: "bcrypt",
    });

    // Record 1 failed attempt
    const incorrectPasswordResponse = await oauthClient.co.authenticate.$post({
      json: {
        client_id: "clientId",
        credential_type: "http://auth0.com/oauth/grant-type/password-realm",
        realm: Strategy.USERNAME_PASSWORD,
        password: "IncorrectPassword",
        username: "testuser2@example.com",
      },
    });

    expect(incorrectPasswordResponse.status).toEqual(403);

    // Verify failed login was recorded
    let activity = await env.data.userActivity.get(
      "tenantId",
      `${USERNAME_PASSWORD_PROVIDER}|userId2`,
    );
    expect(activity?.failed_logins?.length).toBeGreaterThan(0);

    // Now login successfully
    const successResponse = await oauthClient.co.authenticate.$post({
      json: {
        client_id: "clientId",
        credential_type: "http://auth0.com/oauth/grant-type/password-realm",
        realm: Strategy.USERNAME_PASSWORD,
        password: "CorrectPassword123!",
        username: "testuser2@example.com",
      },
    });

    expect(successResponse.status).toEqual(200);

    // Verify failed_logins was cleared
    activity = await env.data.userActivity.get(
      "tenantId",
      `${USERNAME_PASSWORD_PROVIDER}|userId2`,
    );
    expect(activity?.failed_logins ?? []).toEqual([]);
  });

  it("should remove legacy app_metadata.failed_logins on successful login", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    const userId = `${USERNAME_PASSWORD_PROVIDER}|legacyUser`;
    await env.data.users.create("tenantId", {
      email: "legacy@example.com",
      email_verified: true,
      name: "Legacy User",
      nickname: "Legacy User",
      connection: Strategy.USERNAME_PASSWORD,
      provider: USERNAME_PASSWORD_PROVIDER,
      is_social: false,
      user_id: userId,
    });
    await env.data.passwords.create("tenantId", {
      user_id: userId,
      password: await bcryptjs.hash("CorrectPassword123!", 10),
      algorithm: "bcrypt",
    });

    // Strikes from before the user_activity cutover: numeric epochs stored in
    // app_metadata. They must not lock the user out (the lockout check reads
    // user_activity), and a successful login should clean them up.
    await env.data.users.update("tenantId", userId, {
      app_metadata: {
        failed_logins: [Date.now(), Date.now(), Date.now()],
        other_key: "untouched",
      },
    });

    const successResponse = await oauthClient.co.authenticate.$post({
      json: {
        client_id: "clientId",
        credential_type: "http://auth0.com/oauth/grant-type/password-realm",
        realm: Strategy.USERNAME_PASSWORD,
        password: "CorrectPassword123!",
        username: "legacy@example.com",
      },
    });
    expect(successResponse.status).toEqual(200);

    const user = await env.data.users.get("tenantId", userId);
    expect(user?.app_metadata?.failed_logins).toBeUndefined();
    expect(user?.app_metadata?.other_key).toBe("untouched");
  });

  it("should clean up timestamps older than 5 minutes", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    const userId = `${USERNAME_PASSWORD_PROVIDER}|userId3`;
    await env.data.users.create("tenantId", {
      email: "testuser3@example.com",
      email_verified: true,
      name: "Test User 3",
      nickname: "Test User 3",
      connection: Strategy.USERNAME_PASSWORD,
      provider: USERNAME_PASSWORD_PROVIDER,
      is_social: false,
      user_id: userId,
    });
    await env.data.passwords.create("tenantId", {
      user_id: userId,
      password: await bcryptjs.hash("CorrectPassword123!", 10),
      algorithm: "bcrypt",
    });

    // Seed two expired strikes and one recent one. Three entries would be a
    // lockout if the window weren't applied, so the wrong-password attempt
    // below also proves expired strikes don't count toward the limit.
    await env.data.userActivity.upsert("tenantId", userId, {
      failed_logins: [
        new Date(Date.now() - 1000 * 60 * 10).toISOString(), // 10 minutes ago
        new Date(Date.now() - 1000 * 60 * 7).toISOString(), // 7 minutes ago
        new Date(Date.now() - 1000 * 60).toISOString(), // 1 minute ago
      ],
    });

    const incorrectPasswordResponse = await oauthClient.co.authenticate.$post({
      json: {
        client_id: "clientId",
        credential_type: "http://auth0.com/oauth/grant-type/password-realm",
        realm: Strategy.USERNAME_PASSWORD,
        password: "IncorrectPassword",
        username: "testuser3@example.com",
      },
    });
    expect(incorrectPasswordResponse.status).toEqual(403);

    // Recording the new strike prunes the expired ones: only the 1-minute-old
    // seed and the just-recorded strike remain.
    const activity = await env.data.userActivity.get("tenantId", userId);
    expect(activity?.failed_logins?.length).toBe(2);
  });

  it("should track failed logins on linked users' primary account", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    // Create primary user
    const primaryUser = await env.data.users.create("tenantId", {
      email: "primary@example.com",
      email_verified: true,
      name: "Primary User",
      nickname: "Primary User",
      connection: Strategy.USERNAME_PASSWORD,
      provider: USERNAME_PASSWORD_PROVIDER,
      is_social: false,
      user_id: `${USERNAME_PASSWORD_PROVIDER}|primary`,
    });

    // Create linked user
    const linkedUser = await env.data.users.create("tenantId", {
      email: "linked@example.com",
      email_verified: true,
      name: "Linked User",
      nickname: "Linked User",
      connection: Strategy.USERNAME_PASSWORD,
      provider: USERNAME_PASSWORD_PROVIDER,
      is_social: false,
      user_id: `${USERNAME_PASSWORD_PROVIDER}|linked`,
      linked_to: `${USERNAME_PASSWORD_PROVIDER}|primary`,
    });

    // Set password for linked user
    await env.data.passwords.create("tenantId", {
      user_id: `${USERNAME_PASSWORD_PROVIDER}|linked`,
      password: await bcryptjs.hash("LinkedPassword123!", 10),
      algorithm: "bcrypt",
    });

    // Try to login with wrong password on linked user
    const incorrectPasswordResponse = await oauthClient.co.authenticate.$post({
      json: {
        client_id: "clientId",
        credential_type: "http://auth0.com/oauth/grant-type/password-realm",
        realm: Strategy.USERNAME_PASSWORD,
        password: "IncorrectPassword",
        username: "linked@example.com",
      },
    });

    expect(incorrectPasswordResponse.status).toEqual(403);

    // Verify the strike was recorded on the PRIMARY user's activity row
    const primaryActivity = await env.data.userActivity.get(
      "tenantId",
      `${USERNAME_PASSWORD_PROVIDER}|primary`,
    );
    expect(primaryActivity?.failed_logins?.length).toBeGreaterThan(0);

    // And nothing was recorded against the linked identity itself
    const linkedActivity = await env.data.userActivity.get(
      "tenantId",
      `${USERNAME_PASSWORD_PROVIDER}|linked`,
    );
    expect(linkedActivity?.failed_logins ?? []).toEqual([]);
  });
});
