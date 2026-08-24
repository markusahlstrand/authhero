import { describe, it, expect } from "vitest";
import { getAdminToken } from "../helpers/token";
import { getTestServer } from "../helpers/test-server";
import { USERNAME_PASSWORD_PROVIDER } from "../../src/constants";
import { Strategy } from "@authhero/adapter-interfaces";

const TENANT = "tenantId";
const USER_ID = `${USERNAME_PASSWORD_PROVIDER}|rt-user`;
const OTHER_USER_ID = `${USERNAME_PASSWORD_PROVIDER}|rt-other`;

const DEVICE = {
  last_ip: "",
  initial_ip: "",
  last_user_agent: "",
  initial_user_agent: "",
  initial_asn: "",
  last_asn: "",
};

async function seed(env: Awaited<ReturnType<typeof getTestServer>>["env"]) {
  for (const [user_id, email] of [
    [USER_ID, "rt-user@example.com"],
    [OTHER_USER_ID, "rt-other@example.com"],
  ]) {
    await env.data.users.create(TENANT, {
      email: email!,
      email_verified: true,
      connection: Strategy.USERNAME_PASSWORD,
      provider: USERNAME_PASSWORD_PROVIDER,
      is_social: false,
      user_id: user_id!,
    });
  }

  const loginSession = await env.data.loginSessions.create(TENANT, {
    expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
    csrf_token: "csrf",
    authParams: { client_id: "clientId" },
  });

  const create = (id: string, user_id: string) =>
    env.data.refreshTokens.create(TENANT, {
      id,
      login_id: loginSession.id,
      user_id,
      client_id: "clientId",
      device: DEVICE,
      resource_servers: [{ audience: "https://example.com", scopes: "openid" }],
      rotating: true,
      token_lookup: `lookup-${id}`,
      token_hash: `hash-${id}`,
      family_id: id,
      rotated_to: `${id}-child`,
      rotated_at: new Date().toISOString(),
    });

  await create("rt-1", USER_ID);
  await create("rt-2", USER_ID);
  await create("rt-other", OTHER_USER_ID);
}

describe("management-api user refresh tokens", () => {
  it("lists only the user's tokens and never leaks token material", async () => {
    const { managementApp, env } = await getTestServer();
    const token = await getAdminToken();
    await seed(env);

    const res = await managementApp.request(
      `/users/${encodeURIComponent(USER_ID)}/refresh-tokens?include_totals=true`,
      {
        headers: {
          authorization: `Bearer ${token}`,
          "tenant-id": TENANT,
        },
      },
      env,
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.length).toBe(2);
    expect(body.tokens.map((t: { id: string }) => t.id).sort()).toEqual([
      "rt-1",
      "rt-2",
    ]);
    for (const t of body.tokens) {
      // Secret material and internal rotation bookkeeping stay server-side;
      // neither has an Auth0 equivalent on the wire.
      expect(t).not.toHaveProperty("token_lookup");
      expect(t).not.toHaveProperty("token_hash");
      expect(t).not.toHaveProperty("family_id");
      expect(t).not.toHaveProperty("rotated_to");
      expect(t).not.toHaveProperty("rotated_at");
    }
  });

  it("pages with Auth0 checkpoint pagination (from/take + next)", async () => {
    const { managementApp, env } = await getTestServer();
    const token = await getAdminToken();
    await seed(env);

    const get = async (query: string) => {
      const res = await managementApp.request(
        `/users/${encodeURIComponent(USER_ID)}/refresh-tokens?${query}`,
        { headers: { authorization: `Bearer ${token}`, "tenant-id": TENANT } },
        env,
      );
      expect(res.status).toBe(200);
      return res.json();
    };

    const first = await get("take=1");
    expect(first.tokens).toHaveLength(1);
    expect(first.next).toBeTruthy();
    // Checkpoint responses carry no offset envelope.
    expect(first).not.toHaveProperty("start");
    expect(first).not.toHaveProperty("length");

    const second = await get(`from=${encodeURIComponent(first.next)}&take=1`);
    expect(second.tokens).toHaveLength(1);
    expect(second.tokens[0].id).not.toBe(first.tokens[0].id);
    // Two tokens for this user, so the second page is the last.
    expect(second.next).toBeUndefined();

    expect([first.tokens[0].id, second.tokens[0].id].sort()).toEqual([
      "rt-1",
      "rt-2",
    ]);
  });

  it("returns a bare array without include_totals", async () => {
    const { managementApp, env } = await getTestServer();
    const token = await getAdminToken();
    await seed(env);

    const res = await managementApp.request(
      `/users/${encodeURIComponent(USER_ID)}/refresh-tokens`,
      { headers: { authorization: `Bearer ${token}`, "tenant-id": TENANT } },
      env,
    );
    expect(res.status).toBe(200);
    expect(Array.isArray(await res.json())).toBe(true);
  });

  it("treats Lucene operators in a user id as literal text, not query syntax", async () => {
    const { managementApp, env } = await getTestServer();
    const token = await getAdminToken();
    await seed(env);

    // A bare `user_id:${id}` interpolation would parse this as an OR and
    // return the other user's tokens too.
    const injected = `${USER_ID}" OR user_id:"${OTHER_USER_ID}`;

    const res = await managementApp.request(
      `/users/${encodeURIComponent(injected)}/refresh-tokens?include_totals=true`,
      { headers: { authorization: `Bearer ${token}`, "tenant-id": TENANT } },
      env,
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    // No user has that literal id, so nothing matches — and crucially the
    // other user's token is not returned.
    expect(body.tokens).toHaveLength(0);
  });

  it("does not let a crafted user id widen the revoke", async () => {
    const { managementApp, env } = await getTestServer();
    const token = await getAdminToken();
    await seed(env);

    const injected = `${USER_ID}" OR user_id:"${OTHER_USER_ID}`;
    const res = await managementApp.request(
      `/users/${encodeURIComponent(injected)}/refresh-tokens`,
      {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}`, "tenant-id": TENANT },
      },
      env,
    );
    expect(res.status).toBe(204);

    // Every token is still active: the crafted id matched no user.
    for (const id of ["rt-1", "rt-2", "rt-other"]) {
      expect(
        (await env.data.refreshTokens.get(TENANT, id))!.revoked_at,
      ).toBeFalsy();
    }
  });

  it("revokes every token for the user and leaves other users alone", async () => {
    const { managementApp, env } = await getTestServer();
    const token = await getAdminToken();
    await seed(env);

    const res = await managementApp.request(
      `/users/${encodeURIComponent(USER_ID)}/refresh-tokens`,
      {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}`, "tenant-id": TENANT },
      },
      env,
    );
    expect(res.status).toBe(204);

    expect(
      (await env.data.refreshTokens.get(TENANT, "rt-1"))!.revoked_at,
    ).toBeTruthy();
    expect(
      (await env.data.refreshTokens.get(TENANT, "rt-2"))!.revoked_at,
    ).toBeTruthy();
    expect(
      (await env.data.refreshTokens.get(TENANT, "rt-other"))!.revoked_at,
    ).toBeFalsy();
  });
});
