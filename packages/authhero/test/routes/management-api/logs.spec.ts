import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getAdminToken } from "../../helpers/token";
import { getTestServer } from "../../helpers/test-server";
import { Log } from "@authhero/adapter-interfaces";

describe("logs", () => {
  it("should return an empty list of logs for a tenant", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);

    const token = await getAdminToken();
    const response = await managementClient.logs.$get(
      {
        query: {},
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

    expect(response.status).toBe(200);

    const body = (await response.json()) as Log[];
    expect(body.length).toBe(0);
  });

  it("should return a log row for a created user", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);

    const token = await getAdminToken();

    const createUserResponse = await managementClient.users.$post(
      {
        json: {
          email: "test@example.com",
        },
        header: {
          "tenant-id": "tenantId",
        },
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
          "x-real-ip": "1.2.3.4",
          "user-agent": "ua",
        },
      },
    );

    expect(createUserResponse.status).toBe(201);

    const response = await managementClient.logs.$get(
      {
        query: {},
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

    expect(response.status).toBe(200);

    const body = (await response.json()) as Log[];
    if (!Array.isArray(body)) {
      throw new Error("Expected body to be an array");
    }
    expect(body.length).toBe(1);
    const [log] = body;
    if (!log) {
      throw new Error("Log not found");
    }

    if (log.type !== "sapi") {
      throw new Error("Expected log to be of type fsa");
    }
    expect(log.ip).toBe("1.2.3.4");
    expect(log.description).toBe("User created");
    expect(typeof log.date).toBe("string");
    // no client_id here when creating a user - just tenant_id
    expect(log.client_id).toBeNull();
    expect(log.user_agent).toBe("ua");
    expect(log.log_id).toBeTypeOf("string");
    expect(log.details?.request.method).toBe("POST");
  });

  // TODO: add this once authorize is moved
  // it("should log a failed silent auth request", async () => {
  //   const { managementApp, oauthApp, env } = await getTestServer();
  //   const oauthClient = testClient(oauthApp, env);
  //   const managementClient = testClient(managementApp, env);

  //   const token = await getAdminToken();

  //   const silentAuthResponse = await oauthClient.authorize.$get(
  //     {
  //       query: {
  //         client_id: "clientId",
  //         response_type: AuthorizationResponseType.TOKEN_ID_TOKEN,
  //         redirect_uri: "https://login.example.com/callback",
  //         scope: "openid profile email",
  //         state: "j~JrnZZLuAUfJQcKE5ZGSGZUG4hC99DZ",
  //         nonce: "S3RuDcoL67u5ATcK87sgUOxMRql.dyfE",
  //         response_mode: AuthorizationResponseMode.WEB_MESSAGE,
  //         prompt: "none",
  //         auth0Client: "eyJuYW1lIjoiYXV0aDAuanMiLCJ2ZXJzaW9uIjoiOS4yMy4wIn0=",
  //       },
  //     },
  //     {
  //       headers: {
  //         "tenant-id": "tenantId",
  //         "x-real-ip": "1.2.3.4",
  //         "user-agent": "ua",
  //       },
  //     },
  //   );

  //   expect(silentAuthResponse.status).toBe(200);

  //   const response = await managementClient.logs.$get(
  //     {
  //       query: {},
  //       header: {
  //         "tenant-id": "tenantId",
  //       },
  //     },
  //     {
  //       headers: {
  //         authorization: `Bearer ${token}`,
  //       },
  //     },
  //   );

  //   expect(response.status).toBe(200);

  //   const body = (await response.json()) as Log[];
  //   if (!Array.isArray(body)) {
  //     throw new Error("Expected body to be an array");
  //   }
  //   expect(body.length).toBe(1);
  //   const [log] = body;
  //   if (log.type !== "fsa") {
  //     throw new Error("Expected log to be of type fsa");
  //   }
  //   expect(log.type).toBe("fsa");
  //   expect(log.ip).toBe("1.2.3.4");
  //   expect(log.description).toBe("Login required");
  //   expect(typeof log.date).toBe("string");
  //   expect(log.client_id).toBe("clientId");
  //   expect(log.user_agent).toBe("ua");
  //   expect(log.log_id).toBeTypeOf("string");
  //   expect(log.details?.request.method).toBe("GET");
  // });
});
