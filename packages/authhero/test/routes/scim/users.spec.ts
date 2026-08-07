import { describe, it, expect } from "vitest";
import { getTestServer } from "../../helpers/test-server";
import { mintScimToken } from "../../../src/helpers/scim/mint-token";

const TENANT = "tenantId";

async function setupScim(
  env: Awaited<ReturnType<typeof getTestServer>>["env"],
  options: { name?: string; scopes?: string[] } = {},
) {
  const connection = await env.data.connections.create(TENANT, {
    name: options.name ?? "okta-ent",
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
    scopes: options.scopes ?? [],
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

    // A valid token is bound to its connection: presenting it against another
    // connection of the same tenant is rejected.
    const { connection: other } = await setupScim(env, { name: "other-ent" });
    const crossConnection = await app.request(
      `/scim/v2/connections/${other.id}/Users`,
      { headers: headers(token) },
      env,
    );
    expect(crossConnection.status).toBe(401);
  });

  it("enforces the scopes a token was minted with", async () => {
    const { app, env } = await getTestServer();
    const { connection, token } = await setupScim(env, {
      scopes: ["get:users"],
    });
    const base = `/scim/v2/connections/${connection.id}`;
    const h = headers(token);

    const list = await app.request(`${base}/Users`, { headers: h }, env);
    expect(list.status).toBe(200);

    const create = await app.request(
      `${base}/Users`,
      {
        method: "POST",
        headers: h,
        body: JSON.stringify({ userName: "scoped@example.com", active: true }),
      },
      env,
    );
    expect(create.status).toBe(403);

    // …and a token granted the mutation scope can perform it, so the scope
    // names the middleware requires stay the ones a token can be minted with.
    const { connection: writable, token: writeToken } = await setupScim(env, {
      name: "writable-ent",
      scopes: ["post:users", "delete:users"],
    });
    const writeBase = `/scim/v2/connections/${writable.id}`;
    const wh = headers(writeToken);

    const allowed = await app.request(
      `${writeBase}/Users`,
      {
        method: "POST",
        headers: wh,
        body: JSON.stringify({ userName: "scoped@example.com", active: true }),
      },
      env,
    );
    expect(allowed.status).toBe(201);

    // A verb outside the grant is still refused.
    const patch = await app.request(
      `${writeBase}/Users/${encodeURIComponent((await allowed.json()).id)}`,
      {
        method: "PATCH",
        headers: wh,
        body: JSON.stringify({
          Operations: [{ op: "replace", path: "active", value: false }],
        }),
      },
      env,
    );
    expect(patch.status).toBe(403);
  });

  it("never returns a user of another connection", async () => {
    const { app, env } = await getTestServer();
    const { connection, token } = await setupScim(env);
    const { connection: other, token: otherToken } = await setupScim(env, {
      name: "neighbour-ent",
    });

    const created = await app.request(
      `/scim/v2/connections/${other.id}/Users`,
      {
        method: "POST",
        headers: headers(otherToken),
        body: JSON.stringify({
          userName: "neighbour@example.com",
          active: true,
        }),
      },
      env,
    );
    expect(created.status).toBe(201);
    const neighbour = await created.json();

    // Neither by filter…
    const byFilter = await app.request(
      `/scim/v2/connections/${connection.id}/Users?filter=${encodeURIComponent(
        'userName eq "neighbour@example.com"',
      )}`,
      { headers: headers(token) },
      env,
    );
    expect((await byFilter.json()).totalResults).toBe(0);

    // …nor by id.
    const byId = await app.request(
      `/scim/v2/connections/${connection.id}/Users/${encodeURIComponent(neighbour.id)}`,
      { headers: headers(token) },
      env,
    );
    expect(byId.status).toBe(404);
  });

  it("reports the connection's real total when paging", async () => {
    const { app, env } = await getTestServer();
    const { connection, token } = await setupScim(env);
    const base = `/scim/v2/connections/${connection.id}`;
    const h = headers(token);

    for (const name of ["p1", "p2", "p3"]) {
      const res = await app.request(
        `${base}/Users`,
        {
          method: "POST",
          headers: h,
          body: JSON.stringify({
            userName: `${name}@example.com`,
            active: true,
          }),
        },
        env,
      );
      expect(res.status).toBe(201);
    }

    const firstPage = await app.request(
      `${base}/Users?startIndex=1&count=2`,
      { headers: h },
      env,
    );
    const firstBody = await firstPage.json();
    expect(firstBody.Resources).toHaveLength(2);
    expect(firstBody.totalResults).toBe(3);

    const secondPage = await app.request(
      `${base}/Users?startIndex=3&count=2`,
      { headers: h },
      env,
    );
    const secondBody = await secondPage.json();
    expect(secondBody.Resources).toHaveLength(1);
    expect(secondBody.totalResults).toBe(3);
    expect(secondBody.startIndex).toBe(3);
  });

  it("ignores linked identities when listing and filtering", async () => {
    const { app, env } = await getTestServer();
    const { connection, token } = await setupScim(env);
    const base = `/scim/v2/connections/${connection.id}`;
    const h = headers(token);

    const created = await app.request(
      `${base}/Users`,
      {
        method: "POST",
        headers: h,
        body: JSON.stringify({ userName: "primary@example.com", active: true }),
      },
      env,
    );
    expect(created.status).toBe(201);
    const primaryId = (await created.json()).id;

    // A second identity of the same connection, linked to the first. It is not
    // a SCIM resource of its own — it must not count towards totals, and it
    // must not make the connection look bigger than the scan can cover.
    await env.data.users.create(TENANT, {
      email: "primary-alias@example.com",
      email_verified: true,
      connection: "okta-ent",
      provider: "oidc",
      is_social: false,
      user_id: "oidc|linked-identity",
      linked_to: primaryId,
    });

    const list = await app.request(`${base}/Users`, { headers: h }, env);
    expect(list.status).toBe(200);
    const listBody = await list.json();
    expect(listBody.totalResults).toBe(1);
    expect(listBody.Resources).toHaveLength(1);

    // A filter that needs the in-memory scan still answers, rather than
    // reporting the connection as too large to evaluate.
    const filtered = await app.request(
      `${base}/Users?filter=${encodeURIComponent("active eq true")}`,
      { headers: h },
      env,
    );
    expect(filtered.status).toBe(200);
    const filteredBody = await filtered.json();
    expect(filteredBody.totalResults).toBe(1);
    expect(filteredBody.Resources[0].id).toBe(primaryId);
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
