import { describe, it, expect, vi } from "vitest";
import { Context } from "hono";
import { parseJWT } from "../../src/utils/jwt";
import {
  createClientServiceToken,
  createServiceToken,
} from "../../src/helpers/service-token";
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

describe("createServiceToken", () => {
  it("mints an auth-service token from the tenant's audience and signing key", async () => {
    const { env } = await getTestServer();
    const ctx = makeCtx(env);

    const result = await createServiceToken(ctx, TENANT_ID, "webhook");

    expect(result.token_type).toBe("Bearer");
    const payload = parseJWT(result.access_token)!.payload as Record<
      string,
      unknown
    >;
    expect(payload.sub).toBe("auth-service");
    expect(payload.azp).toBe("auth-service");
    expect(payload.aud).toBe("https://example.com");
    expect(payload.scope).toBe("webhook");
    expect(payload.tenant_id).toBe(TENANT_ID);
    expect(payload.iss).toBe(env.ISSUER);
  });

  it("does not run credentials-exchange hooks (a denying tenant hook must not block internal mints)", async () => {
    // Regression: minting used to go through createAuthTokens, which runs the
    // tenant's credentials-exchange hooks. A hook calling api.access.deny()
    // (e.g. a tenant gating logins on an external membership lookup) made
    // every internal service-token mint fail — and since post-user-update
    // hooks mint service tokens, a hook that updates a user could recurse
    // back into itself.
    const { env } = await getTestServer();
    const onExecuteCredentialsExchange = vi.fn(async (_event, api) => {
      api.access.deny("access_denied", "user not found in external system");
    });
    env.hooks = { onExecuteCredentialsExchange };
    const ctx = makeCtx(env);

    const result = await createServiceToken(
      ctx,
      TENANT_ID,
      "profile:user:read",
    );

    expect(onExecuteCredentialsExchange).not.toHaveBeenCalled();
    const payload = parseJWT(result.access_token)!.payload as Record<
      string,
      unknown
    >;
    expect(payload.scope).toBe("profile:user:read");
    expect(payload.sub).toBe("auth-service");
  });

  it("honors expiresInSeconds in both the JWT and the response", async () => {
    const { env } = await getTestServer();
    const ctx = makeCtx(env);

    const result = await createServiceToken(ctx, TENANT_ID, "webhook", 120);

    expect(result.expires_in).toBe(120);
    const payload = parseJWT(result.access_token)!.payload as Record<
      string,
      number
    >;
    expect(payload.exp - payload.iat).toBe(120);
  });

  it("drops reserved claims from customClaims instead of failing the mint", async () => {
    const { env } = await getTestServer();
    const ctx = makeCtx(env);

    const result = await createServiceToken(
      ctx,
      TENANT_ID,
      "webhook",
      undefined,
      { tenant_id: "other-tenant", request_id: "req-1" },
    );

    const payload = parseJWT(result.access_token)!.payload as Record<
      string,
      unknown
    >;
    expect(payload.tenant_id).toBe(TENANT_ID);
    // Non-reserved claims on the same call still land.
    expect(payload.request_id).toBe("req-1");
  });

  it("allows overriding azp via customClaims for downstream attribution", async () => {
    // Regression: the sesamy entitlements hook mints service tokens with
    // customClaims { azp: vendorId, vendor_id: vendorId } so the entitlements
    // API attributes the call to the vendor. 9.1.1 briefly reserved `azp` on
    // internal mints, which made every such mint throw and silently dropped
    // the entitlements claim from issued tokens.
    const { env } = await getTestServer();
    const ctx = makeCtx(env);

    const result = await createServiceToken(
      ctx,
      TENANT_ID,
      "vault:read vault:impersonate",
      undefined,
      { azp: "vendor-1", vendor_id: "vendor-1" },
    );

    const payload = parseJWT(result.access_token)!.payload as Record<
      string,
      unknown
    >;
    expect(payload.sub).toBe("auth-service");
    expect(payload.azp).toBe("vendor-1");
    expect(payload.vendor_id).toBe("vendor-1");
  });
});

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

  it("resolves a control-plane client when absent from the request tenant", async () => {
    const CONTROL_PLANE_TENANT_ID = "control-plane";
    const { env } = await getTestServer();
    await env.data.tenants.create({
      id: CONTROL_PLANE_TENANT_ID,
      friendly_name: "Control Plane",
      audience: "https://control-plane.example.com",
      default_audience: "https://control-plane.example.com",
      sender_email: "login@example.com",
      sender_name: "SenderName",
    });
    await env.data.clients.create(CONTROL_PLANE_TENANT_ID, {
      client_id: "auth-email-sender",
      client_secret: "secret",
      name: "auth-email-sender",
      callbacks: [],
      allowed_logout_urls: [],
      web_origins: [],
    });
    await env.data.clientGrants.create(CONTROL_PLANE_TENANT_ID, {
      client_id: "auth-email-sender",
      audience: "urn:sesamy",
      scope: ["email:queue"],
    });
    env.data.multiTenancyConfig = {
      controlPlaneTenantId: CONTROL_PLANE_TENANT_ID,
    };
    // Request tenant is `tenantId`, which has no `auth-email-sender` client.
    const ctx = makeCtx(env);

    const result = await createClientServiceToken(
      ctx,
      TENANT_ID,
      {
        clientId: "auth-email-sender",
        scope: "email:queue",
        audience: "urn:sesamy",
      },
      { allowControlPlaneFallback: true },
    );

    const payload = parseJWT(result.access_token)!.payload as Record<
      string,
      unknown
    >;
    expect(payload.sub).toBe("auth-email-sender");
    expect(payload.aud).toBe("urn:sesamy");
    expect(payload.scope).toBe("email:queue");
    // The token is minted in the tenant where the client actually lives.
    expect(payload.tenant_id).toBe(CONTROL_PLANE_TENANT_ID);
  });

  it("does not resolve a control-plane client without allowControlPlaneFallback", async () => {
    // Guards the hook-facing token API: a caller that does not opt in must
    // never reach across the tenant boundary into control-plane clients, even
    // when a control plane is configured and holds the named client.
    const CONTROL_PLANE_TENANT_ID = "control-plane";
    const { env } = await getTestServer();
    await env.data.tenants.create({
      id: CONTROL_PLANE_TENANT_ID,
      friendly_name: "Control Plane",
      audience: "https://control-plane.example.com",
      default_audience: "https://control-plane.example.com",
      sender_email: "login@example.com",
      sender_name: "SenderName",
    });
    await env.data.clients.create(CONTROL_PLANE_TENANT_ID, {
      client_id: "auth-email-sender",
      client_secret: "secret",
      name: "auth-email-sender",
      callbacks: [],
      allowed_logout_urls: [],
      web_origins: [],
    });
    await env.data.clientGrants.create(CONTROL_PLANE_TENANT_ID, {
      client_id: "auth-email-sender",
      audience: "urn:sesamy",
      scope: ["email:queue"],
    });
    env.data.multiTenancyConfig = {
      controlPlaneTenantId: CONTROL_PLANE_TENANT_ID,
    };
    const ctx = makeCtx(env);

    await expect(
      createClientServiceToken(ctx, TENANT_ID, {
        clientId: "auth-email-sender",
        scope: "email:queue",
        audience: "urn:sesamy",
      }),
    ).rejects.toThrow(/Client not found/);
  });

  it("honors a resolveControlPlane opt-out (resolver returns undefined)", async () => {
    const { env } = await getTestServer();
    // Client exists in a would-be control plane, but the resolver opts this
    // request tenant out, so the fallback must not reach it.
    await env.data.tenants.create({
      id: "control-plane",
      friendly_name: "Control Plane",
      audience: "https://control-plane.example.com",
      default_audience: "https://control-plane.example.com",
      sender_email: "login@example.com",
      sender_name: "SenderName",
    });
    await env.data.clients.create("control-plane", {
      client_id: "auth-email-sender",
      client_secret: "secret",
      name: "auth-email-sender",
      callbacks: [],
      allowed_logout_urls: [],
      web_origins: [],
    });
    env.data.multiTenancyConfig = {
      controlPlaneTenantId: "control-plane",
      resolveControlPlane: async () => undefined,
    };
    const ctx = makeCtx(env);

    await expect(
      createClientServiceToken(
        ctx,
        TENANT_ID,
        {
          clientId: "auth-email-sender",
          scope: "email:queue",
          audience: "urn:sesamy",
        },
        { allowControlPlaneFallback: true },
      ),
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

  it("drops reserved claims from customClaims instead of failing the mint", async () => {
    const { env } = await setupClientWithGrant({
      clientId: "with-claims",
      audience: "urn:sesamy",
      scopes: ["email:queue"],
    });
    const ctx = makeCtx(env);
    const result = await createClientServiceToken(ctx, TENANT_ID, {
      clientId: "with-claims",
      scope: "email:queue",
      audience: "urn:sesamy",
      customClaims: { sub: "hacker" },
    });
    const payload = parseJWT(result.access_token)!.payload as Record<
      string,
      unknown
    >;
    expect(payload.sub).toBe("with-claims");
  });

  it("keeps azp reserved for client-bound tokens", async () => {
    // Unlike internal auth-service mints, a client-bound token's azp must
    // stay the registered client id.
    const { env } = await setupClientWithGrant({
      clientId: "azp-locked",
      audience: "urn:sesamy",
      scopes: ["email:queue"],
    });
    const ctx = makeCtx(env);
    const result = await createClientServiceToken(ctx, TENANT_ID, {
      clientId: "azp-locked",
      scope: "email:queue",
      audience: "urn:sesamy",
      customClaims: { azp: "spoofed" },
    });
    const payload = parseJWT(result.access_token)!.payload as Record<
      string,
      unknown
    >;
    expect(payload.azp).toBe("azp-locked");
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
