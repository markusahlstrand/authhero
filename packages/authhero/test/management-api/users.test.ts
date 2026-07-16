import { describe, it, expect } from "vitest";
import { getAdminToken } from "../helpers/token";
import { getTestServer } from "../helpers/test-server";

describe("POST /api/v2/users", () => {
  it("returns 400 rather than 500 when the request has no body or content-type", async () => {
    const { managementApp, env } = await getTestServer();
    const token = await getAdminToken();

    // A bodyless POST used to bypass the zod validator entirely (the body was
    // not marked `required`), so the handler ran with `{}` and only failed at
    // the database layer, surfacing as a generic 500.
    const response = await managementApp.request(
      "/users",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "tenant-id": "tenantId",
        },
      },
      env,
    );

    expect(response.status).toBe(400);
  });

  it("returns 400 when a required field is missing from the body", async () => {
    const { managementApp, env } = await getTestServer();
    const token = await getAdminToken();

    const response = await managementApp.request(
      "/users",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "tenant-id": "tenantId",
          "content-type": "application/json",
        },
        // `connection` is required by userInsertSchema.
        body: JSON.stringify({ email: "no-connection@example.com" }),
      },
      env,
    );

    expect(response.status).toBe(400);
  });

  it("still creates a user when given a valid body", async () => {
    const { managementApp, env } = await getTestServer();
    const token = await getAdminToken();

    const response = await managementApp.request(
      "/users",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "tenant-id": "tenantId",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: "valid-body@example.com",
          connection: "Username-Password-Authentication",
        }),
      },
      env,
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toMatchObject({ email: "valid-body@example.com" });
  });
});
