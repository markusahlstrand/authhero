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

    expect(body.keys[1]?.kid).not.toBe(initialKeys.keys[0]?.kid);
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

  it("should NOT advertise end_session_endpoint by default (OIDC RP-Initiated Logout discovery flag off)", async () => {
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
    expect(body.end_session_endpoint).toBeUndefined();
  });

  it("should advertise end_session_endpoint when oidc_logout.rp_logout_end_session_endpoint_discovery is enabled", async () => {
    const { oauthApp, env } = await getTestServer();
    const client = testClient(oauthApp, env);

    await env.data.tenants.update("tenantId", {
      oidc_logout: {
        rp_logout_end_session_endpoint_discovery: true,
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
    expect(body.end_session_endpoint).toBe("http://localhost:3000/oidc/logout");
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
