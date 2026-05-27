import { describe, it, expect } from "vitest";
import { Context } from "hono";
import { parseJWT } from "oslo/jwt";
import { createClientServiceToken } from "../../src/helpers/service-token";
import { getTestServer } from "./test-server";
import { Bindings, Variables } from "../../src/types";

const TENANT_ID = "tenantId";

async function setupClientWithGrant({
  clientId,
  audience,
  scopes,
}: {
  clientId: string;
  audience: string;
  scopes: string[];
}) {
  const server = await getTestServer();
  await server.env.data.clients.create(TENANT_ID, {
    client_id: clientId,
    client_secret: "secret",
    name: clientId,
    callbacks: [],
    allowed_logout_urls: [],
    web_origins: [],
  });
  await server.env.data.clientGrants.create(TENANT_ID, {
    client_id: clientId,
    audience,
    scope: scopes,
  });
  return server;
}

function makeCtx(env: Bindings): Context<{
  Bindings: Bindings;
  Variables: Variables;
}> {
  return { env, var: { tenant_id: TENANT_ID } } as Context<{
    Bindings: Bindings;
    Variables: Variables;
  }>;
}

describe("createClientServiceToken", () => {
  it("mints a JWT bound to the named client and granted scope", async () => {
    const { env } = await setupClientWithGrant({
      clientId: "auth-email-sender",
      audience: "urn:sesamy",
      scopes: ["email:queue", "email:read"],
    });
    const ctx = makeCtx(env);

    const result = await createClientServiceToken(ctx, TENANT_ID, {
      clientId: "auth-email-sender",
      scope: "email:queue",
      audience: "urn:sesamy",
      expiresInSeconds: 60,
    });

    expect(result.token_type).toBe("Bearer");
    expect(result.expires_in).toBe(60);

    const parsed = parseJWT(result.access_token);
    expect(parsed).toBeTruthy();
    const payload = parsed!.payload as Record<string, unknown>;
    expect(payload.sub).toBe("auth-email-sender");
    expect(payload.azp).toBe("auth-email-sender");
    expect(payload.aud).toBe("urn:sesamy");
    expect(payload.scope).toBe("email:queue");
    expect(payload.tenant_id).toBe(TENANT_ID);
    expect(payload.gty).toBe("client_credentials");
    expect(payload.iss).toBe(env.ISSUER);
  });

  it("infers audience when the client has exactly one grant", async () => {
    const { env } = await setupClientWithGrant({
      clientId: "single-grant-client",
      audience: "urn:only",
      scopes: ["api:write"],
    });
    const ctx = makeCtx(env);

    const result = await createClientServiceToken(ctx, TENANT_ID, {
      clientId: "single-grant-client",
      scope: "api:write",
    });
    const payload = parseJWT(result.access_token)!.payload as Record<
      string,
      unknown
    >;
    expect(payload.aud).toBe("urn:only");
  });

  it("rejects when the client is not registered", async () => {
    const { env } = await getTestServer();
    const ctx = makeCtx(env);
    await expect(
      createClientServiceToken(ctx, TENANT_ID, {
        clientId: "missing",
        scope: "email:queue",
        audience: "urn:sesamy",
      }),
    ).rejects.toThrow(/Client not found/);
  });

  it("rejects when the client has no client_grant at all", async () => {
    const { env } = await getTestServer();
    await env.data.clients.create(TENANT_ID, {
      client_id: "no-grants",
      client_secret: "secret",
      name: "no-grants",
      callbacks: [],
      allowed_logout_urls: [],
      web_origins: [],
    });
    const ctx = makeCtx(env);
    await expect(
      createClientServiceToken(ctx, TENANT_ID, {
        clientId: "no-grants",
        scope: "x",
        audience: "urn:any",
      }),
    ).rejects.toThrow(/no client_grant/);
  });

  it("rejects when no grant matches the requested audience", async () => {
    const { env } = await setupClientWithGrant({
      clientId: "with-grant",
      audience: "urn:sesamy",
      scopes: ["api:write"],
    });
    const ctx = makeCtx(env);
    await expect(
      createClientServiceToken(ctx, TENANT_ID, {
        clientId: "with-grant",
        scope: "api:write",
        audience: "urn:other",
      }),
    ).rejects.toThrow(/no client_grant for audience/);
  });

  it("rejects requested scopes outside the grant", async () => {
    const { env } = await setupClientWithGrant({
      clientId: "scoped",
      audience: "urn:sesamy",
      scopes: ["email:queue"],
    });
    const ctx = makeCtx(env);
    await expect(
      createClientServiceToken(ctx, TENANT_ID, {
        clientId: "scoped",
        scope: "email:queue email:admin",
        audience: "urn:sesamy",
      }),
    ).rejects.toThrow(/not authorized for scope\(s\): email:admin/);
  });

  it("rejects ambiguous audience when client has multiple grants", async () => {
    const { env } = await setupClientWithGrant({
      clientId: "multi",
      audience: "urn:a",
      scopes: ["x"],
    });
    await env.data.clientGrants.create(TENANT_ID, {
      client_id: "multi",
      audience: "urn:b",
      scope: ["y"],
    });
    const ctx = makeCtx(env);
    await expect(
      createClientServiceToken(ctx, TENANT_ID, {
        clientId: "multi",
        scope: "x",
      }),
    ).rejects.toThrow(/multiple client_grants/);
  });

  it("rejects reserved claims in customClaims", async () => {
    const { env } = await setupClientWithGrant({
      clientId: "with-claims",
      audience: "urn:sesamy",
      scopes: ["email:queue"],
    });
    const ctx = makeCtx(env);
    await expect(
      createClientServiceToken(ctx, TENANT_ID, {
        clientId: "with-claims",
        scope: "email:queue",
        audience: "urn:sesamy",
        customClaims: { sub: "hacker" },
      }),
    ).rejects.toThrow(/Cannot overwrite reserved claim 'sub'/);
  });

  it("merges non-reserved customClaims into the JWT", async () => {
    const { env } = await setupClientWithGrant({
      clientId: "with-extra",
      audience: "urn:sesamy",
      scopes: ["email:queue"],
    });
    const ctx = makeCtx(env);
    const result = await createClientServiceToken(ctx, TENANT_ID, {
      clientId: "with-extra",
      scope: "email:queue",
      audience: "urn:sesamy",
      customClaims: { request_id: "req-123" },
    });
    const payload = parseJWT(result.access_token)!.payload as Record<
      string,
      unknown
    >;
    expect(payload.request_id).toBe("req-123");
  });
});
