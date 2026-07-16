import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { signJWT } from "../../src/utils/jwt";
import { getTestServer } from "../helpers/test-server";
import { getCertificate, pemToBuffer } from "../helpers/token";

const TENANT_ID = "tenantId";
const ISSUER = "http://localhost:3000/";
const AUDIENCE = "https://example.com";
const USER_ID = "email|userId";

const EXCHANGE_CLIENT_ID = "exchange-client";
const EXCHANGE_CLIENT_SECRET = "exchange-secret";
const TOKEN_EXCHANGE_GRANT = "urn:ietf:params:oauth:grant-type:token-exchange";
const ACCESS_TOKEN_TYPE = "urn:ietf:params:oauth:token-type:access_token";

interface TokenResponse {
  access_token?: string;
  scope?: string;
  expires_in?: number;
  token_type?: string;
}
interface ErrorResponse {
  error?: string;
  error_description?: string;
}

type Env = Awaited<ReturnType<typeof getTestServer>>["env"];

async function seedExchangeClient(
  env: Env,
  overrides: {
    organization_usage?: "deny" | "allow" | "require";
    grant_types?: string[];
  } = {},
) {
  await env.data.clients.create(TENANT_ID, {
    client_id: EXCHANGE_CLIENT_ID,
    client_secret: EXCHANGE_CLIENT_SECRET,
    name: "Exchange Client",
    callbacks: [],
    allowed_logout_urls: [],
    web_origins: [],
    organization_usage: overrides.organization_usage ?? "allow",
    grant_types: overrides.grant_types ?? [TOKEN_EXCHANGE_GRANT],
  });
}

async function seedOrg(env: Env, id = "org_tenant_a") {
  return env.data.organizations.create(TENANT_ID, {
    id,
    name: id,
  });
}

interface SubjectTokenOverrides {
  iss?: string;
  sub?: string;
  scope?: string;
  aud?: string;
  act?: { sub: string };
}

async function mintSubjectToken(
  overrides: SubjectTokenOverrides = {},
): Promise<string> {
  // Reuse the test-server's signing key directly so the JWT verifies against
  // the same JWKS the handler reads from. `data.keys.list()` does not return
  // the private `pkcs7` material (only what's safe to expose).
  const signingKey = await getCertificate();

  return signJWT(
    "RS256",
    pemToBuffer(signingKey.pkcs7!),
    {
      iss: overrides.iss ?? ISSUER,
      sub: overrides.sub ?? USER_ID,
      aud: overrides.aud ?? AUDIENCE,
      scope: overrides.scope ?? "read:things write:things",
      tenant_id: TENANT_ID,
      ...(overrides.act ? { act: overrides.act } : {}),
    },
    {
      includeIssuedTimestamp: true,
      expiresInSeconds: 3600,
      headers: { kid: signingKey.kid },
    },
  );
}

function decodeAccessToken(token: string): Record<string, unknown> {
  const [, payload] = token.split(".");
  const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return JSON.parse(atob(padded));
}

describe("token-exchange grant (RFC 8693)", () => {
  it("exchanges a self-issued access token for an org-scoped token when the user is a member", async () => {
    const { oauthApp, env } = await getTestServer();
    await seedExchangeClient(env);
    const org = await seedOrg(env);
    await env.data.userOrganizations.create(TENANT_ID, {
      user_id: USER_ID,
      organization_id: org.id,
    });

    const subjectToken = await mintSubjectToken();

    const oauthClient = testClient(oauthApp, env);
    const response = await oauthClient.oauth.token.$post(
      // @ts-expect-error - testClient type requires both form and json
      {
        form: {
          grant_type: TOKEN_EXCHANGE_GRANT,
          subject_token: subjectToken,
          subject_token_type: ACCESS_TOKEN_TYPE,
          client_id: EXCHANGE_CLIENT_ID,
          client_secret: EXCHANGE_CLIENT_SECRET,
          organization: org.id,
        },
      },
      { headers: { "tenant-id": TENANT_ID } },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as TokenResponse;
    expect(body.access_token).toBeTypeOf("string");

    const payload = decodeAccessToken(body.access_token!);
    expect(payload.sub).toBe(USER_ID);
    expect(payload.org_id).toBe(org.id);
    expect(payload.aud).toBe(AUDIENCE);
    // Acting party recorded for audit.
    expect(payload.act).toEqual({
      sub: EXCHANGE_CLIENT_ID,
      client_id: EXCHANGE_CLIENT_ID,
    });
  });

  it("rejects when the exchanging client has organization_usage=deny (default for DCR'd clients)", async () => {
    const { oauthApp, env } = await getTestServer();
    await seedExchangeClient(env, { organization_usage: "deny" });
    const org = await seedOrg(env);
    await env.data.userOrganizations.create(TENANT_ID, {
      user_id: USER_ID,
      organization_id: org.id,
    });

    const subjectToken = await mintSubjectToken();
    const oauthClient = testClient(oauthApp, env);
    const response = await oauthClient.oauth.token.$post(
      // @ts-expect-error - testClient type requires both form and json
      {
        form: {
          grant_type: TOKEN_EXCHANGE_GRANT,
          subject_token: subjectToken,
          subject_token_type: ACCESS_TOKEN_TYPE,
          client_id: EXCHANGE_CLIENT_ID,
          client_secret: EXCHANGE_CLIENT_SECRET,
          organization: org.id,
        },
      },
      { headers: { "tenant-id": TENANT_ID } },
    );

    expect(response.status).toBe(403);
    const body = (await response.json()) as ErrorResponse;
    expect(body.error).toBe("unauthorized_client");
  });

  it("rejects subject tokens signed for a different issuer", async () => {
    const { oauthApp, env } = await getTestServer();
    await seedExchangeClient(env);
    const org = await seedOrg(env);
    await env.data.userOrganizations.create(TENANT_ID, {
      user_id: USER_ID,
      organization_id: org.id,
    });

    const subjectToken = await mintSubjectToken({
      iss: "https://other-issuer.example.com/",
    });

    const oauthClient = testClient(oauthApp, env);
    const response = await oauthClient.oauth.token.$post(
      // @ts-expect-error - testClient type requires both form and json
      {
        form: {
          grant_type: TOKEN_EXCHANGE_GRANT,
          subject_token: subjectToken,
          subject_token_type: ACCESS_TOKEN_TYPE,
          client_id: EXCHANGE_CLIENT_ID,
          client_secret: EXCHANGE_CLIENT_SECRET,
          organization: org.id,
        },
      },
      { headers: { "tenant-id": TENANT_ID } },
    );

    expect(response.status).toBe(403);
    const body = (await response.json()) as ErrorResponse;
    expect(body.error).toBe("invalid_grant");
    // Both issuers are named so the mismatch is diagnosable from the response
    // alone — they're public discovery values, not secrets.
    expect(body.error_description).toContain(
      "token iss=https://other-issuer.example.com/",
    );
    expect(body.error_description).toContain(`expected=${ISSUER}`);
  });

  it("names the unresolved host when the expected issuer fell back to ISSUER", async () => {
    const { oauthApp, env } = await getTestServer();
    await seedExchangeClient(env);
    const org = await seedOrg(env);
    await env.data.userOrganizations.create(TENANT_ID, {
      user_id: USER_ID,
      organization_id: org.id,
    });

    // The scenario from the field: a subdomain-addressed tenant minted the
    // token, but the request's host resolves no tenant, so the comparison runs
    // against the bare-host fallback and can never match.
    const subjectToken = await mintSubjectToken({
      iss: "https://tenant.localhost:3000/",
    });

    const oauthClient = testClient(oauthApp, env);
    const response = await oauthClient.oauth.token.$post(
      // @ts-expect-error - testClient type requires both form and json
      {
        form: {
          grant_type: TOKEN_EXCHANGE_GRANT,
          subject_token: subjectToken,
          subject_token_type: ACCESS_TOKEN_TYPE,
          client_id: EXCHANGE_CLIENT_ID,
          client_secret: EXCHANGE_CLIENT_SECRET,
          organization: org.id,
        },
      },
      {
        headers: {
          "tenant-id": TENANT_ID,
          "x-forwarded-host": "internal.svc.example.com",
        },
      },
    );

    expect(response.status).toBe(403);
    const body = (await response.json()) as ErrorResponse;
    expect(body.error).toBe("invalid_grant");
    expect(body.error_description).toContain(
      "request host 'internal.svc.example.com' did not resolve to a tenant domain",
    );
    expect(body.error_description).toContain("fell back to the configured");
  });

  it("omits the ISSUER-fallback note when the host resolved a tenant domain", async () => {
    const { oauthApp, env } = await getTestServer();
    await seedExchangeClient(env);
    const org = await seedOrg(env);
    await env.data.userOrganizations.create(TENANT_ID, {
      user_id: USER_ID,
      organization_id: org.id,
    });
    await env.data.customDomains.create(TENANT_ID, {
      domain: "login.example.com",
      custom_domain_id: "custom-domain-id",
      type: "auth0_managed_certs",
    });

    // Host resolves to a real custom domain, so the expected issuer is that
    // domain — a mismatch here really is the token's fault.
    const subjectToken = await mintSubjectToken({
      iss: "https://other-issuer.example.com/",
    });

    const oauthClient = testClient(oauthApp, env);
    const response = await oauthClient.oauth.token.$post(
      // @ts-expect-error - testClient type requires both form and json
      {
        form: {
          grant_type: TOKEN_EXCHANGE_GRANT,
          subject_token: subjectToken,
          subject_token_type: ACCESS_TOKEN_TYPE,
          client_id: EXCHANGE_CLIENT_ID,
          client_secret: EXCHANGE_CLIENT_SECRET,
          organization: org.id,
        },
      },
      { headers: { host: "login.example.com" } },
    );

    expect(response.status).toBe(403);
    const body = (await response.json()) as ErrorResponse;
    expect(body.error).toBe("invalid_grant");
    expect(body.error_description).toContain(
      "expected=https://login.example.com/",
    );
    expect(body.error_description).not.toContain("fell back");
  });

  it("rejects subject tokens that already carry an act claim (no chained exchange)", async () => {
    const { oauthApp, env } = await getTestServer();
    await seedExchangeClient(env);
    const org = await seedOrg(env);
    await env.data.userOrganizations.create(TENANT_ID, {
      user_id: USER_ID,
      organization_id: org.id,
    });

    const subjectToken = await mintSubjectToken({
      act: { sub: "some-other-actor" },
    });

    const oauthClient = testClient(oauthApp, env);
    const response = await oauthClient.oauth.token.$post(
      // @ts-expect-error - testClient type requires both form and json
      {
        form: {
          grant_type: TOKEN_EXCHANGE_GRANT,
          subject_token: subjectToken,
          subject_token_type: ACCESS_TOKEN_TYPE,
          client_id: EXCHANGE_CLIENT_ID,
          client_secret: EXCHANGE_CLIENT_SECRET,
          organization: org.id,
        },
      },
      { headers: { "tenant-id": TENANT_ID } },
    );

    expect(response.status).toBe(403);
    const body = (await response.json()) as ErrorResponse;
    expect(body.error).toBe("invalid_grant");
  });

  it("rejects when the user is not a member of the requested organization", async () => {
    const { oauthApp, env } = await getTestServer();
    await seedExchangeClient(env);
    const org = await seedOrg(env);
    // No userOrganizations.create — user is not a member.

    const subjectToken = await mintSubjectToken();
    const oauthClient = testClient(oauthApp, env);
    const response = await oauthClient.oauth.token.$post(
      // @ts-expect-error - testClient type requires both form and json
      {
        form: {
          grant_type: TOKEN_EXCHANGE_GRANT,
          subject_token: subjectToken,
          subject_token_type: ACCESS_TOKEN_TYPE,
          client_id: EXCHANGE_CLIENT_ID,
          client_secret: EXCHANGE_CLIENT_SECRET,
          organization: org.id,
        },
      },
      { headers: { "tenant-id": TENANT_ID } },
    );

    expect(response.status).toBe(403);
    const body = (await response.json()) as ErrorResponse;
    expect(body.error).toBe("access_denied");
  });

  it("rejects requested scopes that exceed the subject token's scopes", async () => {
    const { oauthApp, env } = await getTestServer();
    await seedExchangeClient(env);
    const org = await seedOrg(env);
    await env.data.userOrganizations.create(TENANT_ID, {
      user_id: USER_ID,
      organization_id: org.id,
    });

    const subjectToken = await mintSubjectToken({
      scope: "read:things",
    });
    const oauthClient = testClient(oauthApp, env);
    const response = await oauthClient.oauth.token.$post(
      // @ts-expect-error - testClient type requires both form and json
      {
        form: {
          grant_type: TOKEN_EXCHANGE_GRANT,
          subject_token: subjectToken,
          subject_token_type: ACCESS_TOKEN_TYPE,
          client_id: EXCHANGE_CLIENT_ID,
          client_secret: EXCHANGE_CLIENT_SECRET,
          organization: org.id,
          scope: "read:things write:things",
        },
      },
      { headers: { "tenant-id": TENANT_ID } },
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as ErrorResponse;
    expect(body.error).toBe("invalid_scope");
  });

  it("rejects when client_secret is missing or wrong", async () => {
    const { oauthApp, env } = await getTestServer();
    await seedExchangeClient(env);
    const org = await seedOrg(env);
    await env.data.userOrganizations.create(TENANT_ID, {
      user_id: USER_ID,
      organization_id: org.id,
    });

    const subjectToken = await mintSubjectToken();
    const oauthClient = testClient(oauthApp, env);

    const missing = await oauthClient.oauth.token.$post(
      // @ts-expect-error - testClient type requires both form and json
      {
        form: {
          grant_type: TOKEN_EXCHANGE_GRANT,
          subject_token: subjectToken,
          subject_token_type: ACCESS_TOKEN_TYPE,
          client_id: EXCHANGE_CLIENT_ID,
          organization: org.id,
        },
      },
      { headers: { "tenant-id": TENANT_ID } },
    );
    expect(missing.status).toBe(401);

    const wrong = await oauthClient.oauth.token.$post(
      // @ts-expect-error - testClient type requires both form and json
      {
        form: {
          grant_type: TOKEN_EXCHANGE_GRANT,
          subject_token: subjectToken,
          subject_token_type: ACCESS_TOKEN_TYPE,
          client_id: EXCHANGE_CLIENT_ID,
          client_secret: "wrong",
          organization: org.id,
        },
      },
      { headers: { "tenant-id": TENANT_ID } },
    );
    expect(wrong.status).toBe(401);
  });

  it("rejects when the client's grant_types allowlist excludes token-exchange", async () => {
    const { oauthApp, env } = await getTestServer();
    await seedExchangeClient(env, { grant_types: ["client_credentials"] });
    const org = await seedOrg(env);
    await env.data.userOrganizations.create(TENANT_ID, {
      user_id: USER_ID,
      organization_id: org.id,
    });

    const subjectToken = await mintSubjectToken();
    const oauthClient = testClient(oauthApp, env);
    const response = await oauthClient.oauth.token.$post(
      // @ts-expect-error - testClient type requires both form and json
      {
        form: {
          grant_type: TOKEN_EXCHANGE_GRANT,
          subject_token: subjectToken,
          subject_token_type: ACCESS_TOKEN_TYPE,
          client_id: EXCHANGE_CLIENT_ID,
          client_secret: EXCHANGE_CLIENT_SECRET,
          organization: org.id,
        },
      },
      { headers: { "tenant-id": TENANT_ID } },
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as ErrorResponse;
    expect(body.error).toBe("unauthorized_client");
  });
});
