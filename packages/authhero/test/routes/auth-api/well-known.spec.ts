import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getTestServer } from "../../helpers/test-server";
import {
  jwksKeySchema,
  openIDConfigurationSchema,
} from "@authhero/adapter-interfaces";
import { getAdminToken } from "../../helpers/token";

describe("jwks", () => {
  it("should return a list with the test certificate", async () => {
    const { oauthApp, env } = await getTestServer();
    const client = testClient(oauthApp, env);

    const response = await client[".well-known"]["jwks.json"].$get(
      {
        param: {},
      },
      {
        headers: {
          "tenant-id": "tenantId",
        },
      },
    );

    expect(response.status).toBe(200);

    const body = await response.json();
    const jwks = jwksKeySchema.parse(body);
    expect(jwks.keys.length).toBe(1);
  });

  it("should create a new rsa-key and return it", async () => {
    const { oauthApp, managementApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);
    const managementClient = testClient(managementApp, env);

    const initialKey = await oauthClient[".well-known"]["jwks.json"].$get(
      {
        param: {},
      },
      {
        headers: {
          "tenant-id": "tenantId",
        },
      },
    );

    const initialKeys = jwksKeySchema.parse(await initialKey.json());
    expect(initialKeys.keys[0]?.kid).not.toBe("testid-0");

    const token = await getAdminToken();

    const createKeyResponse = await managementClient.keys.signing.rotate.$post(
      {
        header: {
          "tenant-id": "tenantId",
        },
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );

    expect(createKeyResponse.status).toBe(201);

    const response = await oauthClient[".well-known"]["jwks.json"].$get(
      {
        param: {},
      },
      {
        headers: {
          "tenant-id": "tenantId",
        },
      },
    );

    expect(response.status).toBe(200);

    const body = jwksKeySchema.parse(await response.json());

    expect(body.keys.length).toBe(2);

    const initialKid = initialKeys.keys[0]?.kid;
    const kids = body.keys.map((k) => k.kid);
    // The original key is still published during its grace period and a
    // brand-new key was added — assert by membership rather than index so
    // the test doesn't depend on the publish-side sort.
    expect(kids).toContain(initialKid);
    expect(kids.some((k) => k !== initialKid)).toBe(true);
  });

  it("should return an openid-configuration with the current issues", async () => {
    const { oauthApp, env } = await getTestServer();
    const client = testClient(oauthApp, env);

    const response = await client[".well-known"]["openid-configuration"].$get(
      {
        param: {},
      },
      {
        headers: {
          "tenant-id": "tenantId",
        },
      },
    );

    expect(response.status).toBe(200);

    const body = openIDConfigurationSchema.parse(await response.json());
    expect(body.issuer).toBe("http://localhost:3000/");
  });

  it("should advertise hybrid response_types in openid-configuration", async () => {
    const { oauthApp, env } = await getTestServer();
    const client = testClient(oauthApp, env);

    const response = await client[".well-known"]["openid-configuration"].$get(
      {
        param: {},
      },
      {
        headers: {
          "tenant-id": "tenantId",
        },
      },
    );

    expect(response.status).toBe(200);

    const body = openIDConfigurationSchema.parse(await response.json());
    expect(body.response_types_supported).toEqual(
      expect.arrayContaining([
        "code",
        "token",
        "id_token",
        "id_token token",
        "code id_token",
        "code token",
        "code id_token token",
      ]),
    );
  });

  it("should advertise grant_types_supported including refresh_token in openid-configuration", async () => {
    const { oauthApp, env } = await getTestServer();
    const client = testClient(oauthApp, env);

    const response = await client[".well-known"]["openid-configuration"].$get(
      {
        param: {},
      },
      {
        headers: {
          "tenant-id": "tenantId",
        },
      },
    );

    expect(response.status).toBe(200);

    const body = openIDConfigurationSchema.parse(await response.json());
    expect(body.grant_types_supported).toEqual(
      expect.arrayContaining([
        "authorization_code",
        "client_credentials",
        "refresh_token",
      ]),
    );
  });

  it("should advertise end_session_endpoint by default (OIDC RP-Initiated Logout)", async () => {
    const { oauthApp, env } = await getTestServer();
    const client = testClient(oauthApp, env);

    const response = await client[".well-known"]["openid-configuration"].$get(
      {
        param: {},
      },
      {
        headers: {
          "tenant-id": "tenantId",
        },
      },
    );

    expect(response.status).toBe(200);

    const body = openIDConfigurationSchema.parse(await response.json());
    expect(body.end_session_endpoint).toBe("http://localhost:3000/oidc/logout");
  });

  it("should hide end_session_endpoint when oidc_logout.rp_logout_end_session_endpoint_discovery is explicitly disabled", async () => {
    const { oauthApp, env } = await getTestServer();
    const client = testClient(oauthApp, env);

    await env.data.tenants.update("tenantId", {
      oidc_logout: {
        rp_logout_end_session_endpoint_discovery: false,
      },
    });

    const response = await client[".well-known"]["openid-configuration"].$get(
      {
        param: {},
      },
      {
        headers: {
          "tenant-id": "tenantId",
        },
      },
    );

    expect(response.status).toBe(200);

    const body = openIDConfigurationSchema.parse(await response.json());
    expect(body.end_session_endpoint).toBeUndefined();
  });

  it("should advertise end_session_endpoint with the custom-domain host when the flag is enabled", async () => {
    const { oauthApp, env } = await getTestServer();
    const client = testClient(oauthApp, env);

    await env.data.tenants.update("tenantId", {
      oidc_logout: {
        rp_logout_end_session_endpoint_discovery: true,
      },
    });
    await env.data.customDomains.create("tenantId", {
      domain: "login.example.com",
      custom_domain_id: "custom-domain-id",
      type: "auth0_managed_certs",
    });

    const response = await client[".well-known"]["openid-configuration"].$get(
      {
        param: {},
      },
      {
        headers: {
          host: "login.example.com",
        },
      },
    );

    expect(response.status).toBe(200);

    const body = openIDConfigurationSchema.parse(await response.json());
    expect(body.end_session_endpoint).toBe(
      "https://login.example.com/oidc/logout",
    );
  });

  it("should advertise 'none' in token_endpoint_auth_methods_supported (matches Auth0)", async () => {
    const { oauthApp, env } = await getTestServer();
    const client = testClient(oauthApp, env);

    const response = await client[".well-known"]["openid-configuration"].$get(
      {
        param: {},
      },
      {
        headers: {
          "tenant-id": "tenantId",
        },
      },
    );

    expect(response.status).toBe(200);

    const body = openIDConfigurationSchema.parse(await response.json());
    expect(body.token_endpoint_auth_methods_supported).toEqual(
      expect.arrayContaining([
        "none",
        "client_secret_basic",
        "client_secret_post",
        "private_key_jwt",
      ]),
    );
  });

  it("should advertise client_id_metadata_document_supported=false by default and =true when the tenant flag is set", async () => {
    const { oauthApp, env } = await getTestServer();
    const client = testClient(oauthApp, env);

    const before = await client[".well-known"]["oauth-authorization-server"].$get(
      {
        param: {},
      },
      {
        headers: {
          "tenant-id": "tenantId",
        },
      },
    );
    expect(before.status).toBe(200);
    const beforeBody = openIDConfigurationSchema.parse(await before.json());
    expect(beforeBody.client_id_metadata_document_supported).toBe(false);

    await env.data.tenants.update("tenantId", {
      flags: { client_id_metadata_document_registration: true },
    });

    const after = await client[".well-known"]["oauth-authorization-server"].$get(
      {
        param: {},
      },
      {
        headers: {
          "tenant-id": "tenantId",
        },
      },
    );
    expect(after.status).toBe(200);
    const afterBody = openIDConfigurationSchema.parse(await after.json());
    expect(afterBody.client_id_metadata_document_supported).toBe(true);
  });

  it("should return openid-configuration with custom domain URLs when accessed via custom domain", async () => {
    const { oauthApp, env } = await getTestServer();
    const client = testClient(oauthApp, env);

    // Create a custom domain for the tenant
    await env.data.customDomains.create("tenantId", {
      domain: "login.example.com",
      custom_domain_id: "custom-domain-id",
      type: "auth0_managed_certs",
    });

    const response = await client[".well-known"]["openid-configuration"].$get(
      {
        param: {},
      },
      {
        headers: {
          host: "login.example.com",
        },
      },
    );

    expect(response.status).toBe(200);

    const body = openIDConfigurationSchema.parse(await response.json());
    expect(body.issuer).toBe("https://login.example.com/");
    expect(body.authorization_endpoint).toBe(
      "https://login.example.com/authorize",
    );
    expect(body.token_endpoint).toBe("https://login.example.com/oauth/token");
    expect(body.userinfo_endpoint).toBe("https://login.example.com/userinfo");
    expect(body.jwks_uri).toBe(
      "https://login.example.com/.well-known/jwks.json",
    );
  });
});
