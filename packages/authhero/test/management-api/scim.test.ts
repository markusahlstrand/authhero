import { describe, it, expect } from "vitest";
import { getAdminToken } from "../helpers/token";
import { getTestServer } from "../helpers/test-server";

const TENANT = "tenantId";

async function createConnection(
  env: Awaited<ReturnType<typeof getTestServer>>["env"],
  overrides: { name?: string; strategy?: string } = {},
) {
  return env.data.connections.create(TENANT, {
    name: overrides.name ?? "okta-scim",
    strategy: overrides.strategy ?? "okta",
    options: {},
  });
}

function auth(token: string) {
  return {
    authorization: `Bearer ${token}`,
    "tenant-id": TENANT,
    "content-type": "application/json",
  };
}

describe("management-api SCIM configuration", () => {
  it("runs the full configuration + token lifecycle", async () => {
    const { managementApp, env } = await getTestServer();
    const token = await getAdminToken();
    const connection = await createConnection(env);
    const base = `/connections/${connection.id}/scim-configuration`;

    // No configuration yet.
    const missing = await managementApp.request(
      base,
      { headers: auth(token) },
      env,
    );
    expect(missing.status).toBe(404);

    // Create.
    const created = await managementApp.request(
      base,
      {
        method: "POST",
        headers: auth(token),
        body: JSON.stringify({
          mapping: [{ scim: "userName", auth0: "email" }],
        }),
      },
      env,
    );
    expect(created.status).toBe(201);
    const createdBody = await created.json();
    expect(createdBody).toMatchObject({
      connection_id: connection.id,
      connection_name: "okta-scim",
      strategy: "okta",
      user_id_attribute: "externalId",
      mapping: [{ scim: "userName", auth0: "email" }],
    });

    // Duplicate create → 409.
    const dup = await managementApp.request(
      base,
      {
        method: "POST",
        headers: auth(token),
        body: JSON.stringify({}),
      },
      env,
    );
    expect(dup.status).toBe(409);

    // Get.
    const got = await managementApp.request(
      base,
      { headers: auth(token) },
      env,
    );
    expect(got.status).toBe(200);
    expect(await got.json()).toMatchObject({ connection_id: connection.id });

    // Default mapping.
    const defaults = await managementApp.request(
      `${base}/default-mapping`,
      { headers: auth(token) },
      env,
    );
    expect(defaults.status).toBe(200);
    const defaultsBody = await defaults.json();
    expect(defaultsBody.user_id_attribute).toBe("externalId");
    expect(Array.isArray(defaultsBody.mapping)).toBe(true);

    // Patch.
    const patched = await managementApp.request(
      base,
      {
        method: "PATCH",
        headers: auth(token),
        body: JSON.stringify({ user_id_attribute: "userName" }),
      },
      env,
    );
    expect(patched.status).toBe(200);
    expect((await patched.json()).user_id_attribute).toBe("userName");

    // Create a token — raw secret returned once.
    const mintRes = await managementApp.request(
      `${base}/tokens`,
      {
        method: "POST",
        headers: auth(token),
        body: JSON.stringify({ scopes: ["read:users", "write:users"] }),
      },
      env,
    );
    expect(mintRes.status).toBe(201);
    const minted = await mintRes.json();
    expect(minted.token).toBeTruthy();
    expect(minted.scopes).toEqual(["read:users", "write:users"]);
    const tokenId = minted.token_id;

    // List tokens — no raw secret.
    const listRes = await managementApp.request(
      `${base}/tokens`,
      { headers: auth(token) },
      env,
    );
    expect(listRes.status).toBe(200);
    const list = await listRes.json();
    expect(list).toHaveLength(1);
    expect(list[0].token_id).toBe(tokenId);
    expect(list[0].token).toBeUndefined();

    // Delete token.
    const delTok = await managementApp.request(
      `${base}/tokens/${tokenId}`,
      { method: "DELETE", headers: auth(token) },
      env,
    );
    expect(delTok.status).toBe(204);

    // Mint a second token, then delete the configuration: its tokens go with
    // it, since a token is meaningless without a configuration.
    const second = await managementApp.request(
      `${base}/tokens`,
      { method: "POST", headers: auth(token), body: JSON.stringify({}) },
      env,
    );
    expect(second.status).toBe(201);

    // Delete configuration.
    const delCfg = await managementApp.request(
      base,
      { method: "DELETE", headers: auth(token) },
      env,
    );
    expect(delCfg.status).toBe(204);

    expect(
      await env.data.scimTokens!.listByConnection(TENANT, connection.id),
    ).toEqual([]);

    const afterDelete = await managementApp.request(
      base,
      { headers: auth(token) },
      env,
    );
    expect(afterDelete.status).toBe(404);
  });

  it("only deletes a token through its own connection", async () => {
    const { managementApp, env } = await getTestServer();
    const token = await getAdminToken();
    const owner = await createConnection(env, { name: "token-owner" });
    const other = await createConnection(env, { name: "token-bystander" });

    for (const connection of [owner, other]) {
      const created = await managementApp.request(
        `/connections/${connection.id}/scim-configuration`,
        { method: "POST", headers: auth(token), body: JSON.stringify({}) },
        env,
      );
      expect(created.status).toBe(201);
    }

    const mintRes = await managementApp.request(
      `/connections/${owner.id}/scim-configuration/tokens`,
      { method: "POST", headers: auth(token), body: JSON.stringify({}) },
      env,
    );
    const { token_id } = await mintRes.json();

    // Addressed under the wrong connection → not found, and still alive.
    const crossDelete = await managementApp.request(
      `/connections/${other.id}/scim-configuration/tokens/${token_id}`,
      { method: "DELETE", headers: auth(token) },
      env,
    );
    expect(crossDelete.status).toBe(404);
    expect(await env.data.scimTokens!.get(TENANT, token_id)).not.toBeNull();

    const ownDelete = await managementApp.request(
      `/connections/${owner.id}/scim-configuration/tokens/${token_id}`,
      { method: "DELETE", headers: auth(token) },
      env,
    );
    expect(ownDelete.status).toBe(204);
    expect(await env.data.scimTokens!.get(TENANT, token_id)).toBeNull();
  });

  it("404s when the connection does not exist", async () => {
    const { managementApp, env } = await getTestServer();
    const token = await getAdminToken();

    const res = await managementApp.request(
      "/connections/con_missing/scim-configuration",
      {
        method: "POST",
        headers: auth(token),
        body: JSON.stringify({}),
      },
      env,
    );
    expect(res.status).toBe(404);
  });

  it("rejects unauthenticated requests", async () => {
    const { managementApp, env } = await getTestServer();
    const connection = await createConnection(env, { name: "unauth-conn" });

    const res = await managementApp.request(
      `/connections/${connection.id}/scim-configuration`,
      { headers: { "tenant-id": TENANT } },
      env,
    );
    expect(res.status).toBe(401);
  });

  it("requires a configuration before minting a token", async () => {
    const { managementApp, env } = await getTestServer();
    const token = await getAdminToken();
    const connection = await createConnection(env, { name: "no-config-conn" });

    const res = await managementApp.request(
      `/connections/${connection.id}/scim-configuration/tokens`,
      {
        method: "POST",
        headers: auth(token),
        body: JSON.stringify({}),
      },
      env,
    );
    expect(res.status).toBe(404);
  });
});
