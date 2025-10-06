import { describe, it, expect } from "vitest";
import { getTestServer } from "../helpers/test-server";
import { testClient } from "hono/testing";
import { getAdminToken } from "../helpers/token";

describe("user update - Management API logging", () => {
  it("should log user updates with sapi type and full request/response details", async () => {
    const { env, managementApp } = await getTestServer();

    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    // Create a user first
    const createUserResponse = await client.users.$post(
      {
        json: {
          email: "test@example.com",
          email_verified: false,
          name: "Test User",
          nickname: "test",
        },
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

    expect(createUserResponse.status).toBe(201);
    const createdUser = await createUserResponse.json();

    // Update user with multiple field changes
    const updateResponse = await client.users[":user_id"].$patch(
      {
        json: {
          name: "Updated Name",
          nickname: "updated",
          email_verified: true,
        },
        header: {
          "tenant-id": "tenantId",
        },
        param: {
          user_id: createdUser.user_id,
        },
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );

    expect(updateResponse.status).toBe(200);

    // Fetch logs
    const { logs } = await env.data.logs.list("tenantId", {
      page: 0,
      per_page: 100,
      include_totals: false,
    });

    // Find the sapi (SUCCESS_API_OPERATION) log for the update
    const updateLog = logs.find(
      (log) =>
        log.type === "sapi" &&
        log.description === "Update a User" &&
        log.details?.request?.method?.toLowerCase() === "patch",
    );

    expect(updateLog).toBeDefined();
    expect(updateLog?.date).toBeDefined();
    expect(updateLog?.type).toBe("sapi");
    expect(updateLog?.description).toBe("Update a User");

    // Verify request details are logged
    expect(updateLog?.details?.request).toBeDefined();
    expect(updateLog?.details?.request?.method?.toLowerCase()).toBe("patch");
    expect(updateLog?.details?.request?.path).toContain("/users/");
    expect(updateLog?.details?.request?.body).toBeDefined();
    expect(updateLog?.details?.request?.body?.name).toBe("Updated Name");
    expect(updateLog?.details?.request?.body?.nickname).toBe("updated");
    expect(updateLog?.details?.request?.body?.email_verified).toBe(true);

    // Verify response details are logged
    expect(updateLog?.details?.response).toBeDefined();
    expect(updateLog?.details?.response?.statusCode).toBe(200);
    expect(updateLog?.details?.response?.body).toBeDefined();
    expect(updateLog?.details?.response?.body?.name).toBe("Updated Name");
    expect(updateLog?.details?.response?.body?.nickname).toBe("updated");
  });

  it("should log email changes with both sapi and sce logs", async () => {
    const { env, managementApp } = await getTestServer();

    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    // Create a user
    const createUserResponse = await client.users.$post(
      {
        json: {
          email: "old@example.com",
          email_verified: false,
          name: "Test User",
        },
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

    expect(createUserResponse.status).toBe(201);
    const createdUser = await createUserResponse.json();

    // Update email
    const updateResponse = await client.users[":user_id"].$patch(
      {
        json: {
          email: "new@example.com",
        },
        header: {
          "tenant-id": "tenantId",
        },
        param: {
          user_id: createdUser.user_id,
        },
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );

    expect(updateResponse.status).toBe(200);

    // Fetch logs
    const { logs } = await env.data.logs.list("tenantId", {
      page: 0,
      per_page: 100,
      include_totals: false,
    });

    // Should have sapi log for the Management API operation
    const sapiLog = logs.find(
      (log) =>
        log.type === "sapi" &&
        log.description === "Update a User" &&
        log.details?.request?.body?.email === "new@example.com",
    );

    expect(sapiLog).toBeDefined();
    expect(sapiLog?.details?.request?.body?.email).toBe("new@example.com");

    // Should also have sce (SUCCESS_CHANGE_EMAIL) log
    const emailChangeLog = logs.find((log) => log.type === "sce");
    expect(emailChangeLog).toBeDefined();
    expect(emailChangeLog?.description).toContain("new@example.com");
  });

  it("should include timestamp and user information in log", async () => {
    const { env, managementApp } = await getTestServer();

    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    // Create a user
    const createUserResponse = await client.users.$post(
      {
        json: {
          email: "timestamp-test@example.com",
          name: "Timestamp Test",
        },
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

    expect(createUserResponse.status).toBe(201);
    const createdUser = await createUserResponse.json();

    const beforeUpdate = new Date();

    // Update user
    await client.users[":user_id"].$patch(
      {
        json: {
          name: "Timestamp Updated",
        },
        header: {
          "tenant-id": "tenantId",
        },
        param: {
          user_id: createdUser.user_id,
        },
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );

    const afterUpdate = new Date();

    // Fetch logs
    const { logs } = await env.data.logs.list("tenantId", {
      page: 0,
      per_page: 100,
      include_totals: false,
    });

    const updateLog = logs.find(
      (log) =>
        log.type === "sapi" &&
        log.description === "Update a User" &&
        log.details?.request?.body?.name === "Timestamp Updated",
    );

    expect(updateLog).toBeDefined();

    // Verify log has required fields
    expect(updateLog?.type).toBe("sapi");
    expect(updateLog?.date).toBeDefined();
    expect(updateLog?.ip).toBeDefined();
    expect(updateLog?.user_agent).toBeDefined();

    // Verify timestamp is within reasonable range
    const logDate = new Date(updateLog!.date);
    expect(logDate.getTime()).toBeGreaterThanOrEqual(beforeUpdate.getTime());
    expect(logDate.getTime()).toBeLessThanOrEqual(afterUpdate.getTime());
  });

  it("should log metadata updates in request body", async () => {
    const { env, managementApp } = await getTestServer();

    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    // Create a user
    const createUserResponse = await client.users.$post(
      {
        json: {
          email: "metadata-test@example.com",
          name: "Metadata Test",
        },
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

    expect(createUserResponse.status).toBe(201);
    const createdUser = await createUserResponse.json();

    // Update with metadata
    await client.users[":user_id"].$patch(
      {
        json: {
          user_metadata: {
            foo: "bar",
            preferences: {
              theme: "dark",
            },
          },
          app_metadata: {
            role: "admin",
          },
        },
        header: {
          "tenant-id": "tenantId",
        },
        param: {
          user_id: createdUser.user_id,
        },
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );

    // Fetch logs
    const { logs } = await env.data.logs.list("tenantId", {
      page: 0,
      per_page: 100,
      include_totals: false,
    });

    const updateLog = logs.find(
      (log) =>
        log.type === "sapi" &&
        log.description === "Update a User" &&
        log.details?.request?.body?.user_metadata,
    );

    expect(updateLog).toBeDefined();

    // Verify metadata is in the request body
    expect(updateLog?.details?.request?.body?.user_metadata).toEqual({
      foo: "bar",
      preferences: {
        theme: "dark",
      },
    });
    expect(updateLog?.details?.request?.body?.app_metadata).toEqual({
      role: "admin",
    });

    // Verify metadata is in the response body
    expect(updateLog?.details?.response?.body?.user_metadata).toBeDefined();
    expect(updateLog?.details?.response?.body?.app_metadata).toBeDefined();
  });
});
