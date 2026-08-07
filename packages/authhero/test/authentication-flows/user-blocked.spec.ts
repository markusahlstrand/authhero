import { describe, it, expect } from "vitest";
import { getTestServer } from "../helpers/test-server";
import { testClient } from "hono/testing";
import bcryptjs from "bcryptjs";
import { USERNAME_PASSWORD_PROVIDER } from "../../src/constants";
import { Strategy } from "@authhero/adapter-interfaces";

const USER_ID = `${USERNAME_PASSWORD_PROVIDER}|blocked-user`;

async function seedPasswordUser(
  env: Awaited<ReturnType<typeof getTestServer>>["env"],
) {
  await env.data.users.create("tenantId", {
    email: "blocked@example.com",
    email_verified: true,
    name: "Blocked User",
    nickname: "Blocked User",
    connection: Strategy.USERNAME_PASSWORD,
    provider: USERNAME_PASSWORD_PROVIDER,
    is_social: false,
    user_id: USER_ID,
  });
  await env.data.passwords.create("tenantId", {
    user_id: USER_ID,
    password: await bcryptjs.hash("CorrectPassword123!", 10),
    algorithm: "bcrypt",
  });
}

function login(oauthClient: ReturnType<typeof testClient>) {
  return oauthClient.co.authenticate.$post({
    json: {
      client_id: "clientId",
      credential_type: "http://auth0.com/oauth/grant-type/password-realm",
      realm: Strategy.USERNAME_PASSWORD,
      password: "CorrectPassword123!",
      username: "blocked@example.com",
    },
  });
}

describe("user blocked enforcement", () => {
  it("allows login before block and refuses it after", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);
    await seedPasswordUser(env);

    // Baseline: a normal login succeeds.
    const before = await login(oauthClient);
    expect(before.status).toBe(200);

    // Block the user.
    await env.data.users.update("tenantId", USER_ID, { blocked: true });

    // The same valid credentials are now refused.
    const after = await login(oauthClient);
    expect(after.status).toBe(403);
  });

  it("blocks a linked identity when the primary is blocked", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);
    await seedPasswordUser(env);

    // A social primary that the password user links to.
    const primaryId = "google-oauth2|primary";
    await env.data.users.create("tenantId", {
      email: "blocked@example.com",
      email_verified: true,
      connection: "google-oauth2",
      provider: "google-oauth2",
      is_social: true,
      user_id: primaryId,
    });
    await env.data.users.update("tenantId", USER_ID, { linked_to: primaryId });
    await env.data.users.update("tenantId", primaryId, { blocked: true });

    const res = await login(oauthClient);
    expect(res.status).toBe(403);
  });
});
