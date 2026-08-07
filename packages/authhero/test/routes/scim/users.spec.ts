import { describe, it, expect } from "vitest";
import { getTestServer } from "../../helpers/test-server";
import { mintScimToken } from "../../../src/helpers/scim/mint-token";

const TENANT = "tenantId";

async function setupScim(
  env: Awaited<ReturnType<typeof getTestServer>>["env"],
) {
  const connection = await env.data.connections.create(TENANT, {
    name: "okta-ent",
    strategy: "oidc",
    options: {},
  });
  await env.data.scimConfigurations!.create(TENANT, {
    connection_id: connection.id,
    user_id_attribute: "externalId",
    mapping: [],
  });
  const minted = await mintScimToken();
  await env.data.scimTokens!.create(TENANT, {
    token_id: minted.token_id,
    connection_id: connection.id,
    token_hash: minted.token_hash,
    scopes: [],
  });
  return { connection, token: minted.token };
}

function headers(token: string) {
  return {
    authorization: `Bearer ${token}`,
    "tenant-id": TENANT,
    "content-type": "application/scim+json",
  };
}

describe("SCIM /Users endpoints", () => {
  it("runs the Entra-style provisioning lifecycle", async () => {
    const { app, env } = await getTestServer();
    const { connection, token } = await setupScim(env);
    const base = `/scim/v2/connections/${connection.id}`;
    const h = headers(token);

    // 1. IdP looks up the user before creating (not found).
    const lookup = await app.request(
      `${base}/Users?filter=${encodeURIComponent('userName eq "alice@example.com"')}`,
      { headers: h },
      env,
    );
    expect(lookup.status).toBe(200);
    const lookupBody = await lookup.json();
    expect(lookupBody.schemas).toContain(
      "urn:ietf:params:scim:api:messages:2.0:ListResponse",
    );
    expect(lookupBody.totalResults).toBe(0);

    // 2. Create.
    const create = await app.request(
      `${base}/Users`,
      {
        method: "POST",
        headers: h,
        body: JSON.stringify({
          schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
          userName: "alice@example.com",
          externalId: "ext-alice",
          name: { givenName: "Alice", familyName: "Smith" },
          emails: [{ value: "alice@example.com", primary: true, type: "work" }],
          active: true,
        }),
      },
      env,
    );
    expect(create.status).toBe(201);
    const created = await create.json();
    expect(created.id).toBeTruthy();
    expect(created.userName).toBe("alice@example.com");
    expect(created.externalId).toBe("ext-alice");
    expect(created.active).toBe(true);
    const userId = created.id;

    // 3. Get by id.
    const get = await app.request(
      `${base}/Users/${encodeURIComponent(userId)}`,
      { headers: h },
      env,
    );
    expect(get.status).toBe(200);
    expect((await get.json()).name.givenName).toBe("Alice");

    // 4. Lookup by externalId now finds them.
    const byExt = await app.request(
      `${base}/Users?filter=${encodeURIComponent('externalId eq "ext-alice"')}`,
      { headers: h },
      env,
    );
    const byExtBody = await byExt.json();
    expect(byExtBody.totalResults).toBe(1);
    expect(byExtBody.Resources[0].id).toBe(userId);

    // 5. Deactivate via PATCH → user is blocked in AuthHero.
    const patch = await app.request(
      `${base}/Users/${encodeURIComponent(userId)}`,
      {
        method: "PATCH",
        headers: h,
        body: JSON.stringify({
          schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
          Operations: [{ op: "replace", path: "active", value: false }],
        }),
      },
      env,
    );
    expect(patch.status).toBe(200);
    expect((await patch.json()).active).toBe(false);
    const blockedUser = await env.data.users.get(TENANT, userId);
    expect(blockedUser!.blocked).toBe(true);

    // 6. Delete.
    const del = await app.request(
      `${base}/Users/${encodeURIComponent(userId)}`,
      { method: "DELETE", headers: h },
      env,
    );
    expect(del.status).toBe(204);

    // 7. Gone.
    const after = await app.request(
      `${base}/Users/${encodeURIComponent(userId)}`,
      { headers: h },
      env,
    );
    expect(after.status).toBe(404);
  });

  it("supports POST /Users/.search", async () => {
    const { app, env } = await getTestServer();
    const { connection, token } = await setupScim(env);
    const base = `/scim/v2/connections/${connection.id}`;
    const h = headers(token);

    await app.request(
      `${base}/Users`,
      {
        method: "POST",
        headers: h,
        body: JSON.stringify({
          userName: "bob@example.com",
          externalId: "ext-bob",
          active: true,
        }),
      },
      env,
    );

    const search = await app.request(
      `${base}/Users/.search`,
      {
        method: "POST",
        headers: h,
        body: JSON.stringify({ filter: 'userName eq "bob@example.com"' }),
      },
      env,
    );
    expect(search.status).toBe(200);
    const body = await search.json();
    expect(body.totalResults).toBe(1);
    expect(body.Resources[0].userName).toBe("bob@example.com");
  });

  it("returns 409 uniqueness on duplicate userName", async () => {
    const { app, env } = await getTestServer();
    const { connection, token } = await setupScim(env);
    const base = `/scim/v2/connections/${connection.id}`;
    const h = headers(token);
    const body = JSON.stringify({ userName: "dupe@example.com", active: true });

    const first = await app.request(
      `${base}/Users`,
      { method: "POST", headers: h, body },
      env,
    );
    expect(first.status).toBe(201);
    const second = await app.request(
      `${base}/Users`,
      { method: "POST", headers: h, body },
      env,
    );
    expect(second.status).toBe(409);
    expect((await second.json()).scimType).toBe("uniqueness");
  });

  it("rejects missing and invalid bearer tokens", async () => {
    const { app, env } = await getTestServer();
    const { connection, token } = await setupScim(env);
    const base = `/scim/v2/connections/${connection.id}`;

    const noToken = await app.request(
      `${base}/Users`,
      { headers: { "tenant-id": TENANT } },
      env,
    );
    expect(noToken.status).toBe(401);

    const badToken = await app.request(
      `${base}/Users`,
      { headers: { authorization: "Bearer nope", "tenant-id": TENANT } },
      env,
    );
    expect(badToken.status).toBe(401);

    // A valid token is bound to its connection.
    void token;
  });

  it("exposes ServiceProviderConfig", async () => {
    const { app, env } = await getTestServer();
    const { connection, token } = await setupScim(env);
    const res = await app.request(
      `/scim/v2/connections/${connection.id}/ServiceProviderConfig`,
      { headers: headers(token) },
      env,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.patch.supported).toBe(true);
    expect(body.filter.supported).toBe(true);
    expect(body.bulk.supported).toBe(false);
  });
});
