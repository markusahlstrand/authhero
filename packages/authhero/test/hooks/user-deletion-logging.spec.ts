import { describe, it, expect } from "vitest";
import { getTestServer } from "../helpers/test-server";
import { testClient } from "hono/testing";
import { getAdminToken } from "../helpers/token";

describe("user deletion - Management API logging", () => {
  it("should log user deletion with both sapi and sdu types", async () => {
    const { env, managementApp } = await getTestServer();

    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    // Create a user first
    const createUserResponse = await client.users.$post(
      {
        json: {
          email: "delete-test@example.com",
          email_verified: false,
          name: "Delete Test User",
          nickname: "deletetest",
          connection: "Username-Password-Authentication",
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

    // Delete the user
    const deleteResponse = await client.users[":user_id"].$delete(
      {
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

    expect(deleteResponse.status).toBe(200);

    // Fetch logs
    const { logs } = await env.data.logs.list("tenantId", {
      page: 0,
      per_page: 100,
      include_totals: false,
    });

    // Find the sdu (SUCCESS_USER_DELETION) log
    const deletionLog = logs.find(
      (log) =>
        log.type === "sdu" &&
        log.description?.includes("delete-test@example.com"),
    );

    expect(deletionLog).toBeDefined();
    expect(deletionLog?.date).toBeDefined();
    expect(deletionLog?.type).toBe("sdu");
    expect(deletionLog?.description).toBe(
      `Deleted user: delete-test@example.com`,
    );
    expect(deletionLog?.user_id).toBe(createdUser.user_id);
    expect(deletionLog?.connection).toBeDefined();
    expect(deletionLog?.strategy).toBeDefined();
    expect(deletionLog?.strategy_type).toBeDefined();

    // Verify details contain tenant and connection info
    expect(deletionLog?.details?.request?.body).toBeDefined();
    expect(deletionLog?.details?.request?.body?.tenant).toBe("tenantId");
    expect(deletionLog?.details?.request?.body?.connection).toBeDefined();

    // Find the sapi (SUCCESS_API_OPERATION) log
    const sapiLog = logs.find(
      (log) =>
        log.type === "sapi" &&
        log.description === "Delete a User" &&
        log.details?.request?.method?.toLowerCase() === "delete",
    );

    expect(sapiLog).toBeDefined();
    expect(sapiLog?.date).toBeDefined();
    expect(sapiLog?.type).toBe("sapi");
    expect(sapiLog?.description).toBe("Delete a User");

    // Verify request details are logged
    expect(sapiLog?.details?.request).toBeDefined();
    expect(sapiLog?.details?.request?.method?.toLowerCase()).toBe("delete");
    expect(sapiLog?.details?.request?.path).toContain("/users/");

    // Verify response details are logged
    expect(sapiLog?.details?.response).toBeDefined();
    expect(sapiLog?.details?.response?.statusCode).toBe(204);
    expect(sapiLog?.details?.response?.body).toEqual({});
  });

  it("should log user deletion with sdu type and user details", async () => {
    const { env, managementApp } = await getTestServer();

    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    // Create a user first
    const createUserResponse = await client.users.$post(
      {
        json: {
          email: "delete-test@example.com",
          email_verified: false,
          name: "Delete Test User",
          nickname: "deletetest",
          connection: "Username-Password-Authentication",
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

    // Delete the user
    const deleteResponse = await client.users[":user_id"].$delete(
      {
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

    expect(deleteResponse.status).toBe(200);

    // Fetch logs
    const { logs } = await env.data.logs.list("tenantId", {
      page: 0,
      per_page: 100,
      include_totals: false,
    });

    // Find the sdu (SUCCESS_USER_DELETION) log
    const deletionLog = logs.find(
      (log) =>
        log.type === "sdu" &&
        log.description?.includes("delete-test@example.com"),
    );

    expect(deletionLog).toBeDefined();
    expect(deletionLog?.date).toBeDefined();
    expect(deletionLog?.type).toBe("sdu");
    expect(deletionLog?.description).toBe(
      `Deleted user: delete-test@example.com`,
    );
    expect(deletionLog?.user_id).toBe(createdUser.user_id);
    expect(deletionLog?.connection).toBeDefined();
    expect(deletionLog?.strategy).toBeDefined();
    expect(deletionLog?.strategy_type).toBeDefined();

    // Verify details contain tenant and connection info
    expect(deletionLog?.details?.request?.body).toBeDefined();
    expect(deletionLog?.details?.request?.body?.tenant).toBe("tenantId");
    expect(deletionLog?.details?.request?.body?.connection).toBeDefined();
  });

  it("should log deletion with correct strategy_type for database users", async () => {
    const { env, managementApp } = await getTestServer();

    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    // Create a database user
    const createUserResponse = await client.users.$post(
      {
        json: {
          email: "database-user@example.com",
          name: "Database User",
          connection: "Username-Password-Authentication",
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

    // Delete the user
    await client.users[":user_id"].$delete(
      {
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

    const deletionLog = logs.find(
      (log) =>
        log.type === "sdu" &&
        log.description?.includes("database-user@example.com"),
    );

    expect(deletionLog).toBeDefined();
    expect(deletionLog?.user_id).toBe(createdUser.user_id);
    expect(deletionLog?.strategy_type).toBe("database");
    expect(deletionLog?.connection).toBe("Username-Password-Authentication");
  });

  it("should include timestamp in deletion log", async () => {
    const { env, managementApp } = await getTestServer();

    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    // Create a user
    const createUserResponse = await client.users.$post(
      {
        json: {
          email: "timestamp-delete@example.com",
          name: "Timestamp Delete Test",
          connection: "Username-Password-Authentication",
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

    const beforeDelete = new Date();

    // Delete the user
    await client.users[":user_id"].$delete(
      {
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

    const afterDelete = new Date();

    // Fetch logs
    const { logs } = await env.data.logs.list("tenantId", {
      page: 0,
      per_page: 100,
      include_totals: false,
    });

    const deletionLog = logs.find(
      (log) =>
        log.type === "sdu" &&
        log.description?.includes("timestamp-delete@example.com"),
    );

    expect(deletionLog).toBeDefined();
    expect(deletionLog?.user_id).toBe(createdUser.user_id);

    // Verify timestamp is within reasonable range
    const logDate = new Date(deletionLog!.date);
    expect(logDate.getTime()).toBeGreaterThanOrEqual(beforeDelete.getTime());
    expect(logDate.getTime()).toBeLessThanOrEqual(afterDelete.getTime());
  });

  it("should not create log if user does not exist", async () => {
    const { env, managementApp } = await getTestServer();

    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    const nonExistentUserId = "auth0|nonexistent123";

    // Get logs before deletion attempt
    const beforeLogs = await env.data.logs.list("tenantId", {
      page: 0,
      per_page: 100,
      include_totals: false,
    });

    // Try to delete non-existent user
    const deleteResponse = await client.users[":user_id"].$delete(
      {
        header: {
          "tenant-id": "tenantId",
        },
        param: {
          user_id: nonExistentUserId,
        },
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );

    expect(deleteResponse.status).toBe(404);

    // Get logs after deletion attempt
    const afterLogs = await env.data.logs.list("tenantId", {
      page: 0,
      per_page: 100,
      include_totals: false,
    });

    // Should not have created a new sdu log
    const newSduLogs = afterLogs.logs.filter(
      (log) =>
        log.type === "sdu" &&
        !beforeLogs.logs.some((beforeLog) => beforeLog.date === log.date),
    );

    expect(newSduLogs.length).toBe(0);
  });

  it("should unlink secondary users when primary user is deleted", async () => {
    const { env, managementApp } = await getTestServer();

    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    // Create primary user
    const createPrimaryResponse = await client.users.$post(
      {
        json: {
          email: "primary@example.com",
          email_verified: false,
          name: "Primary User",
          nickname: "primary",
          connection: "Username-Password-Authentication",
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

    expect(createPrimaryResponse.status).toBe(201);
    const primaryUser = await createPrimaryResponse.json();

    // Create secondary user
    const createSecondaryResponse = await client.users.$post(
      {
        json: {
          email: "secondary@example.com",
          email_verified: false,
          name: "Secondary User",
          nickname: "secondary",
          connection: "email",
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

    expect(createSecondaryResponse.status).toBe(201);
    const secondaryUser = await createSecondaryResponse.json();

    // Link secondary to primary
    const linkResponse = await client.users[":user_id"].identities.$post(
      {
        param: {
          user_id: primaryUser.user_id,
        },
        json: {
          link_with: secondaryUser.user_id,
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

    expect(linkResponse.status).toBe(201);

    // Verify the link is established
    const linkedUser = await env.data.users.get(
      "tenantId",
      secondaryUser.user_id,
    );
    expect(linkedUser!.linked_to).toBe(primaryUser.user_id);

    // Delete the primary user
    const deleteResponse = await client.users[":user_id"].$delete(
      {
        header: {
          "tenant-id": "tenantId",
        },
        param: {
          user_id: primaryUser.user_id,
        },
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );

    expect(deleteResponse.status).toBe(200);

    // Verify the primary user is deleted
    const deletedPrimary = await env.data.users.get(
      "tenantId",
      primaryUser.user_id,
    );
    expect(deletedPrimary).toBeNull();

    // Verify the secondary user still exists and is now unlinked (standalone)
    const unlinkedSecondary = await env.data.users.get(
      "tenantId",
      secondaryUser.user_id,
    );
    expect(unlinkedSecondary).not.toBeNull();
    expect(unlinkedSecondary!.linked_to).toBeFalsy();
    expect(unlinkedSecondary!.email).toBe("secondary@example.com");
  });
});
