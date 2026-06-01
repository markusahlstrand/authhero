import { describe, it, expect } from "vitest";
import { LogTypes } from "@authhero/adapter-interfaces";
import { createToken, getAdminToken } from "../helpers/token";
import { getTestServer } from "../helpers/test-server";

describe("management-api fapi logging", () => {
  it("writes a FAILED_API_OPERATION log when a request 401s (no bearer token)", async () => {
    const { managementApp, env } = await getTestServer();

    const res = await managementApp.request(
      "/users",
      { method: "GET", headers: { "tenant-id": "tenantId" } },
      env,
    );

    expect(res.status).toBe(401);

    const { logs } = await env.data.logs.list("tenantId", {
      page: 0,
      per_page: 50,
      include_totals: true,
    });
    const fapi = logs.find((l) => l.type === LogTypes.FAILED_API_OPERATION);
    expect(fapi).toBeDefined();
    expect(fapi?.details).toMatchObject({
      response: { statusCode: 401 },
    });
  });

  it("writes a FAILED_API_OPERATION log when a token is missing the management audience (403)", async () => {
    const { managementApp, env } = await getTestServer();
    const token = await createToken({ aud: "https://example.com" });

    const res = await managementApp.request(
      "/users",
      {
        method: "GET",
        headers: {
          "tenant-id": "tenantId",
          authorization: `Bearer ${token}`,
        },
      },
      env,
    );

    expect(res.status).toBe(403);

    const { logs } = await env.data.logs.list("tenantId", {
      page: 0,
      per_page: 50,
      include_totals: true,
    });
    const fapi = logs.find((l) => l.type === LogTypes.FAILED_API_OPERATION);
    expect(fapi).toBeDefined();
    expect(fapi?.details).toMatchObject({
      response: { statusCode: 403 },
    });
  });

  it("does not write a FAILED_API_OPERATION log for successful requests", async () => {
    const { managementApp, env } = await getTestServer();
    const token = await getAdminToken();

    const res = await managementApp.request(
      "/users",
      {
        method: "GET",
        headers: {
          "tenant-id": "tenantId",
          authorization: `Bearer ${token}`,
        },
      },
      env,
    );

    expect(res.status).toBe(200);

    const { logs } = await env.data.logs.list("tenantId", {
      page: 0,
      per_page: 50,
      include_totals: true,
    });
    const fapi = logs.find((l) => l.type === LogTypes.FAILED_API_OPERATION);
    expect(fapi).toBeUndefined();
  });
});
