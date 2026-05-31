import { describe, it, expect, vi, afterEach } from "vitest";
import { testClient } from "hono/testing";
import { openIDConfigurationSchema } from "@authhero/adapter-interfaces";
import { getTestServer } from "../../helpers/test-server";
import {
  isCimdClientId,
  resolveCimdClient,
  cimdDocumentSchema,
} from "../../../src/helpers/cimd";
import { SsrfFetchOptions } from "../../../src/utils/ssrf-fetch";

const CIMD_URL = "https://rp.example.com/cimd.json";

const ALLOW_PRIVATE: SsrfFetchOptions = {
  allowPrivateHosts: true,
  allowedSchemes: ["http:", "https:"],
};

function validDocument(overrides: Record<string, unknown> = {}) {
  return {
    client_id: CIMD_URL,
    client_name: "Example MCP Client",
    grant_types: ["authorization_code", "refresh_token"],
    redirect_uris: ["https://rp.example.com/callback"],
    application_type: "web",
    ...overrides,
  };
}

function mockFetchJson(body: unknown, status = 200) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(
    async () =>
      new Response(typeof body === "string" ? body : JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
  );
}

async function enableCimd(
  env: Awaited<ReturnType<typeof getTestServer>>["env"],
) {
  await env.data.tenants.update("tenantId", {
    flags: { client_id_metadata_document_registration: true },
  });
}

describe("isCimdClientId", () => {
  it("recognizes http(s) URLs and rejects opaque ids", () => {
    expect(isCimdClientId("https://rp.example.com/cimd.json")).toBe(true);
    expect(isCimdClientId("http://localhost:8080/cimd.json")).toBe(true);
    expect(isCimdClientId("clientId")).toBe(false);
    expect(isCimdClientId("not a url")).toBe(false);
  });
});

describe("cimdDocumentSchema", () => {
  it("requires an authorization_code or refresh_token grant", () => {
    expect(
      cimdDocumentSchema.safeParse(
        validDocument({ grant_types: ["client_credentials"] }),
      ).success,
    ).toBe(false);
  });

  it("rejects unsupported token_endpoint_auth_method", () => {
    expect(
      cimdDocumentSchema.safeParse(
        validDocument({ token_endpoint_auth_method: "client_secret_basic" }),
      ).success,
    ).toBe(false);
  });
});

describe("resolveCimdClient", () => {
  afterEach(() => vi.restoreAllMocks());

  it("fetches, validates, and maps a document into a public client", async () => {
    mockFetchJson(validDocument());

    const client = await resolveCimdClient(CIMD_URL, ALLOW_PRIVATE);

    expect(client.client_id).toBe(CIMD_URL);
    expect(client.name).toBe("Example MCP Client");
    expect(client.app_type).toBe("regular_web");
    expect(client.is_first_party).toBe(false);
    expect(client.token_endpoint_auth_method).toBe("none");
    expect(client.client_secret).toBeUndefined();
    expect(client.callbacks).toEqual(["https://rp.example.com/callback"]);
    expect(client.grant_types).toEqual(["authorization_code", "refresh_token"]);
  });

  it("maps native application_type and jwks_uri", async () => {
    mockFetchJson(
      validDocument({
        application_type: "native",
        token_endpoint_auth_method: "private_key_jwt",
        jwks_uri: "https://rp.example.com/jwks.json",
      }),
    );

    const client = await resolveCimdClient(CIMD_URL, ALLOW_PRIVATE);

    expect(client.app_type).toBe("native");
    expect(client.token_endpoint_auth_method).toBe("private_key_jwt");
    expect(client.client_metadata?.jwks_uri).toBe(
      "https://rp.example.com/jwks.json",
    );
  });

  it("rejects when the document client_id does not match the URL", async () => {
    mockFetchJson(validDocument({ client_id: "https://evil.example/cimd" }));
    await expect(resolveCimdClient(CIMD_URL, ALLOW_PRIVATE)).rejects.toThrow(
      /does not match/,
    );
  });

  it("rejects private_key_jwt without a jwks_uri", async () => {
    mockFetchJson(
      validDocument({ token_endpoint_auth_method: "private_key_jwt" }),
    );
    await expect(resolveCimdClient(CIMD_URL, ALLOW_PRIVATE)).rejects.toThrow(
      /jwks_uri is required/,
    );
  });

  it("rejects a non-200 response", async () => {
    mockFetchJson("not found", 404);
    await expect(resolveCimdClient(CIMD_URL, ALLOW_PRIVATE)).rejects.toThrow(
      /status 404/,
    );
  });

  it("rejects a document larger than the size cap", async () => {
    mockFetchJson(validDocument({ client_name: "x".repeat(6 * 1024) }));
    await expect(resolveCimdClient(CIMD_URL, ALLOW_PRIVATE)).rejects.toThrow(
      /Invalid CIMD/,
    );
  });

  it("rejects http URLs when private hosts are not allowed", async () => {
    mockFetchJson(validDocument());
    await expect(
      resolveCimdClient("http://rp.example.com/cimd.json"),
    ).rejects.toThrow(/Invalid CIMD/);
  });

  it("rejects a URL without a path", async () => {
    await expect(
      resolveCimdClient("https://rp.example.com", ALLOW_PRIVATE),
    ).rejects.toThrow(/must contain a path/);
  });

  it("rejects a client_id longer than 120 bytes", async () => {
    const longUrl = `https://rp.example.com/${"a".repeat(120)}`;
    await expect(resolveCimdClient(longUrl, ALLOW_PRIVATE)).rejects.toThrow(
      /exceeds 120 bytes/,
    );
  });

  it("rejects URLs with a query string", async () => {
    await expect(
      resolveCimdClient("https://rp.example.com/cimd?x=1", ALLOW_PRIVATE),
    ).rejects.toThrow(/query string/);
  });
});

describe("authorization server metadata advertises CIMD", () => {
  it("advertises the flag as false when the tenant setting is off", async () => {
    const { oauthApp, env } = await getTestServer();
    const client = testClient(oauthApp, env);

    const response = await client[".well-known"]["openid-configuration"].$get(
      { param: {} },
      { headers: { "tenant-id": "tenantId" } },
    );

    const body = openIDConfigurationSchema.parse(await response.json());
    expect(body.client_id_metadata_document_supported).toBe(false);
  });

  it("advertises the flag on both metadata endpoints when enabled", async () => {
    const { oauthApp, env } = await getTestServer();
    await enableCimd(env);
    const client = testClient(oauthApp, env);

    const oidc = await client[".well-known"]["openid-configuration"].$get(
      { param: {} },
      { headers: { "tenant-id": "tenantId" } },
    );
    const oidcBody = openIDConfigurationSchema.parse(await oidc.json());
    expect(oidcBody.client_id_metadata_document_supported).toBe(true);

    const as = await client[".well-known"]["oauth-authorization-server"].$get(
      { param: {} },
      { headers: { "tenant-id": "tenantId" } },
    );
    expect(as.status).toBe(200);
    const asBody = openIDConfigurationSchema.parse(await as.json());
    expect(asBody.client_id_metadata_document_supported).toBe(true);
    expect(asBody.issuer).toBe("http://localhost:3000/");
  });
});

describe("/authorize with a CIMD client_id", () => {
  afterEach(() => vi.restoreAllMocks());

  it("resolves the CIMD client and redirects to universal login", async () => {
    const { oauthApp, env } = await getTestServer();
    await enableCimd(env);
    env.ALLOW_PRIVATE_OUTBOUND_FETCH = true;
    const fetchSpy = mockFetchJson(validDocument());

    const oauthClient = testClient(oauthApp, env);
    const response = await oauthClient.authorize.$get({
      query: {
        client_id: CIMD_URL,
        redirect_uri: "https://rp.example.com/callback",
        response_type: "code",
        scope: "openid",
        code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
        code_challenge_method: "S256",
        state: "xyz",
      },
    });

    expect(fetchSpy).toHaveBeenCalled();
    expect(response.status).not.toBe(400);
    expect([200, 302]).toContain(response.status);
  });

  it("returns 403 when the tenant flag is disabled", async () => {
    const { oauthApp, env } = await getTestServer();
    env.ALLOW_PRIVATE_OUTBOUND_FETCH = true;
    mockFetchJson(validDocument());

    const oauthClient = testClient(oauthApp, env);
    const response = await oauthClient.authorize.$get({
      query: {
        client_id: CIMD_URL,
        redirect_uri: "https://rp.example.com/callback",
        response_type: "code",
        scope: "openid",
        code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
        code_challenge_method: "S256",
      },
    });

    expect(response.status).toBe(403);
  });

  it("rejects a code flow without PKCE S256", async () => {
    const { oauthApp, env } = await getTestServer();
    await enableCimd(env);
    env.ALLOW_PRIVATE_OUTBOUND_FETCH = true;
    mockFetchJson(validDocument());

    const oauthClient = testClient(oauthApp, env);
    const response = await oauthClient.authorize.$get({
      query: {
        client_id: CIMD_URL,
        redirect_uri: "https://rp.example.com/callback",
        response_type: "code",
        scope: "openid",
      },
    });

    expect(response.status).toBe(400);
    expect(await response.text()).toMatch(/PKCE/);
  });

  it("rejects when the document client_id does not match the URL", async () => {
    const { oauthApp, env } = await getTestServer();
    await enableCimd(env);
    env.ALLOW_PRIVATE_OUTBOUND_FETCH = true;
    mockFetchJson(validDocument({ client_id: "https://evil.example/cimd" }));

    const oauthClient = testClient(oauthApp, env);
    const response = await oauthClient.authorize.$get({
      query: {
        client_id: CIMD_URL,
        redirect_uri: "https://rp.example.com/callback",
        response_type: "code",
        scope: "openid",
        code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
        code_challenge_method: "S256",
      },
    });

    expect(response.status).toBe(400);
    expect(await response.text()).toMatch(/does not match/);
  });

  it("upserts a stub client row so refresh_token FK is satisfied", async () => {
    const { oauthApp, env } = await getTestServer();
    await enableCimd(env);
    env.ALLOW_PRIVATE_OUTBOUND_FETCH = true;
    mockFetchJson(validDocument());

    expect(await env.data.clients.get("tenantId", CIMD_URL)).toBeNull();

    const oauthClient = testClient(oauthApp, env);
    await oauthClient.authorize.$get({
      query: {
        client_id: CIMD_URL,
        redirect_uri: "https://rp.example.com/callback",
        response_type: "code",
        scope: "openid",
        code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
        code_challenge_method: "S256",
        state: "xyz",
      },
    });

    const stub = await env.data.clients.get("tenantId", CIMD_URL);
    expect(stub).not.toBeNull();
    expect(stub?.name).toBe("Example MCP Client");
    expect(stub?.client_metadata?.cimd).toBe("true");
  });
});
