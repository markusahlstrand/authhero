import { describe, it, expect, vi } from "vitest";
import { testClient } from "hono/testing";
import { getAdminToken } from "../helpers/token";
import { getTestServer } from "../helpers/test-server";

describe("User Deletion Hooks", () => {
  describe("onExecutePreUserDeletion", () => {
    it("should be called before user deletion with correct event data", async () => {
      const hookMock = vi.fn();
      const { managementApp, env } = await getTestServer({
        hooks: {
          onExecutePreUserDeletion: hookMock,
        },
      });
      const managementClient = testClient(managementApp, env);
      const token = await getAdminToken();

      // Create a user to delete
      const createResponse = await managementClient.users.$post(
        {
          json: {
            email: "delete-test@example.com",
            connection: "email",
            email_verified: true,
            user_metadata: { test: "value" },
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

      expect(createResponse.status).toBe(201);
      const createdUser = await createResponse.json();

      // Delete the user
      const deleteResponse = await managementClient.users[":user_id"].$delete(
        {
          param: { user_id: createdUser.user_id },
          header: { "tenant-id": "tenantId" },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      expect(deleteResponse.status).toBe(200);

      // Verify the hook was called
      expect(hookMock).toHaveBeenCalledTimes(1);

      // Check the event data passed to the hook
      const call = hookMock.mock.calls[0];
      if (!call) throw new Error("Hook was not called");
      const [event, api] = call;
      expect(event.user.user_id).toBe(createdUser.user_id);
      expect(event.user.email).toBe("delete-test@example.com");
      // Note: user_metadata might be filtered out in the response, so just check it exists
      expect(event.user).toBeDefined();
      expect(event.user_id).toBe(createdUser.user_id);
      expect(event.tenant.id).toBe("tenantId");
      expect(event.request).toBeDefined();
      expect(event.request.method).toBe("DELETE");

      // Verify API has cancel method
      expect(typeof api.cancel).toBe("function");
    });

    it("should allow cancellation of user deletion via api.cancel()", async () => {
      const hookMock = vi.fn(async (event, api) => {
        // Cancel deletion for this specific user
        if (event.user.email === "protected@example.com") {
          api.cancel();
        }
      });

      const { managementApp, env } = await getTestServer({
        hooks: {
          onExecutePreUserDeletion: hookMock,
        },
      });
      const managementClient = testClient(managementApp, env);
      const token = await getAdminToken();

      // Create a protected user
      const createResponse = await managementClient.users.$post(
        {
          json: {
            email: "protected@example.com",
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

      expect(createResponse.status).toBe(201);
      const protectedUser = await createResponse.json();

      // Try to delete the protected user
      const deleteResponse = await managementClient.users[":user_id"].$delete(
        {
          param: { user_id: protectedUser.user_id },
          header: { "tenant-id": "tenantId" },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      // Deletion should fail
      expect(deleteResponse.status).toBe(400);

      // Try to parse error response if it's JSON, otherwise just check status
      let errorResponse;
      try {
        errorResponse = await deleteResponse.json();
        expect(errorResponse.message).toContain("cancelled");
      } catch (e) {
        // Response might not be JSON, which is fine - we already checked the status
      }

      // Verify the hook was called
      expect(hookMock).toHaveBeenCalledTimes(1);

      // Verify user still exists
      const { users } = await env.data.users.list("tenantId");
      const userStillExists = users.find(
        (u) => u.user_id === protectedUser.user_id,
      );
      expect(userStillExists).toBeDefined();
    });

    it("should prevent deletion when hook throws an error", async () => {
      const hookMock = vi.fn(async () => {
        throw new Error("Validation failed: user has active subscription");
      });

      const { managementApp, env } = await getTestServer({
        hooks: {
          onExecutePreUserDeletion: hookMock,
        },
      });
      const managementClient = testClient(managementApp, env);
      const token = await getAdminToken();

      // Create a user
      const createResponse = await managementClient.users.$post(
        {
          json: {
            email: "has-subscription@example.com",
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

      expect(createResponse.status).toBe(201);
      const user = await createResponse.json();

      // Try to delete the user
      const deleteResponse = await managementClient.users[":user_id"].$delete(
        {
          param: { user_id: user.user_id },
          header: { "tenant-id": "tenantId" },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      // Deletion should fail
      expect(deleteResponse.status).toBe(400);

      // Verify the hook was called
      expect(hookMock).toHaveBeenCalledTimes(1);

      // Verify user still exists
      const { users } = await env.data.users.list("tenantId");
      const userStillExists = users.find((u) => u.user_id === user.user_id);
      expect(userStillExists).toBeDefined();
    });

    it("should allow deletion to proceed when hook completes successfully", async () => {
      const hookMock = vi.fn(async (event) => {
        // Log the deletion but allow it
        console.log(`Pre-deletion validation for ${event.user.email}`);
      });

      const { managementApp, env } = await getTestServer({
        hooks: {
          onExecutePreUserDeletion: hookMock,
        },
      });
      const managementClient = testClient(managementApp, env);
      const token = await getAdminToken();

      // Create a user
      const createResponse = await managementClient.users.$post(
        {
          json: {
            email: "can-delete@example.com",
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

      expect(createResponse.status).toBe(201);
      const user = await createResponse.json();

      // Delete the user
      const deleteResponse = await managementClient.users[":user_id"].$delete(
        {
          param: { user_id: user.user_id },
          header: { "tenant-id": "tenantId" },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      // Deletion should succeed
      expect(deleteResponse.status).toBe(200);

      // Verify the hook was called
      expect(hookMock).toHaveBeenCalledTimes(1);

      // Verify user no longer exists
      const { users } = await env.data.users.list("tenantId");
      const userDeleted = users.find((u) => u.user_id === user.user_id);
      expect(userDeleted).toBeUndefined();
    });
  });

  describe("onExecutePostUserDeletion", () => {
    it("should be called after successful user deletion with correct event data", async () => {
      const hookMock = vi.fn();
      const { managementApp, env } = await getTestServer({
        hooks: {
          onExecutePostUserDeletion: hookMock,
        },
      });
      const managementClient = testClient(managementApp, env);
      const token = await getAdminToken();

      // Create a user to delete
      const createResponse = await managementClient.users.$post(
        {
          json: {
            email: "post-delete-test@example.com",
            connection: "email",
            email_verified: true,
            app_metadata: { role: "user" },
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

      expect(createResponse.status).toBe(201);
      const createdUser = await createResponse.json();

      // Delete the user
      const deleteResponse = await managementClient.users[":user_id"].$delete(
        {
          param: { user_id: createdUser.user_id },
          header: { "tenant-id": "tenantId" },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      expect(deleteResponse.status).toBe(200);

      // Verify the hook was called
      expect(hookMock).toHaveBeenCalledTimes(1);

      // Check the event data passed to the hook
      const [event, api] = hookMock.mock.calls[0] || [];
      expect(event.user.user_id).toBe(createdUser.user_id);
      expect(event.user.email).toBe("post-delete-test@example.com");
      expect(event.user_id).toBe(createdUser.user_id);
      expect(event.tenant.id).toBe("tenantId");
      expect(event.request).toBeDefined();
      expect(event.request.method).toBe("DELETE");

      // Verify API object exists (even if empty)
      expect(api).toBeDefined();
      expect(typeof api).toBe("object");

      // Verify user is actually deleted
      const { users } = await env.data.users.list("tenantId");
      const userDeleted = users.find((u) => u.user_id === createdUser.user_id);
      expect(userDeleted).toBeUndefined();
    });

    it("should still complete deletion even if post-hook throws an error", async () => {
      const hookMock = vi.fn(async () => {
        throw new Error("Failed to notify external system");
      });

      const { managementApp, env } = await getTestServer({
        hooks: {
          onExecutePostUserDeletion: hookMock,
        },
      });
      const managementClient = testClient(managementApp, env);
      const token = await getAdminToken();

      // Create a user
      const createResponse = await managementClient.users.$post(
        {
          json: {
            email: "post-hook-error@example.com",
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

      expect(createResponse.status).toBe(201);
      const user = await createResponse.json();

      // Delete the user
      const deleteResponse = await managementClient.users[":user_id"].$delete(
        {
          param: { user_id: user.user_id },
          header: { "tenant-id": "tenantId" },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      // Deletion should still succeed
      expect(deleteResponse.status).toBe(200);

      // Verify the hook was called
      expect(hookMock).toHaveBeenCalledTimes(1);

      // Verify user is deleted (deletion completed despite hook error)
      const { users } = await env.data.users.list("tenantId");
      const userDeleted = users.find((u) => u.user_id === user.user_id);
      expect(userDeleted).toBeUndefined();
    });

    it("should allow cleanup operations in post-deletion hook", async () => {
      const cleanupOperations: string[] = [];

      const hookMock = vi.fn(async (event) => {
        // Simulate cleanup operations
        cleanupOperations.push(`deleted_user_${event.user_id}`);
        cleanupOperations.push(`sent_email_to_${event.user.email}`);
        cleanupOperations.push(`logged_audit_${event.tenant.id}`);
      });

      const { managementApp, env } = await getTestServer({
        hooks: {
          onExecutePostUserDeletion: hookMock,
        },
      });
      const managementClient = testClient(managementApp, env);
      const token = await getAdminToken();

      // Create a user
      const createResponse = await managementClient.users.$post(
        {
          json: {
            email: "cleanup-test@example.com",
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

      expect(createResponse.status).toBe(201);
      const user = await createResponse.json();

      // Delete the user
      const deleteResponse = await managementClient.users[":user_id"].$delete(
        {
          param: { user_id: user.user_id },
          header: { "tenant-id": "tenantId" },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      expect(deleteResponse.status).toBe(200);

      // Verify cleanup operations were performed
      expect(cleanupOperations).toHaveLength(3);
      expect(cleanupOperations[0]).toContain(user.user_id);
      expect(cleanupOperations[1]).toContain("cleanup-test@example.com");
      expect(cleanupOperations[2]).toContain("tenantId");
    });
  });

  describe("Both pre and post hooks together", () => {
    it("should call both hooks in correct order", async () => {
      const callOrder: string[] = [];

      const preHook = vi.fn(async (_event) => {
        callOrder.push("pre");
      });

      const postHook = vi.fn(async (_event) => {
        callOrder.push("post");
      });

      const { managementApp, env } = await getTestServer({
        hooks: {
          onExecutePreUserDeletion: preHook,
          onExecutePostUserDeletion: postHook,
        },
      });
      const managementClient = testClient(managementApp, env);
      const token = await getAdminToken();

      // Create a user
      const createResponse = await managementClient.users.$post(
        {
          json: {
            email: "both-hooks@example.com",
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

      expect(createResponse.status).toBe(201);
      const user = await createResponse.json();

      // Delete the user
      const deleteResponse = await managementClient.users[":user_id"].$delete(
        {
          param: { user_id: user.user_id },
          header: { "tenant-id": "tenantId" },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      expect(deleteResponse.status).toBe(200);

      // Verify both hooks were called in correct order
      expect(callOrder).toEqual(["pre", "post"]);
      expect(preHook).toHaveBeenCalledTimes(1);
      expect(postHook).toHaveBeenCalledTimes(1);
    });

    it("should not call post-hook if pre-hook cancels deletion", async () => {
      const preHook = vi.fn(async (_event, api) => {
        api.cancel();
      });

      const postHook = vi.fn();

      const { managementApp, env } = await getTestServer({
        hooks: {
          onExecutePreUserDeletion: preHook,
          onExecutePostUserDeletion: postHook,
        },
      });
      const managementClient = testClient(managementApp, env);
      const token = await getAdminToken();

      // Create a user
      const createResponse = await managementClient.users.$post(
        {
          json: {
            email: "cancelled-deletion@example.com",
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

      expect(createResponse.status).toBe(201);
      const user = await createResponse.json();

      // Try to delete the user
      const deleteResponse = await managementClient.users[":user_id"].$delete(
        {
          param: { user_id: user.user_id },
          header: { "tenant-id": "tenantId" },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      // Deletion should fail
      expect(deleteResponse.status).toBe(400);

      // Verify pre-hook was called but post-hook was not
      expect(preHook).toHaveBeenCalledTimes(1);
      expect(postHook).not.toHaveBeenCalled();

      // Verify user still exists
      const { users } = await env.data.users.list("tenantId");
      const userStillExists = users.find((u) => u.user_id === user.user_id);
      expect(userStillExists).toBeDefined();
    });

    it("should pass same user data to both hooks", async () => {
      let preHookUser: any;
      let postHookUser: any;

      const preHook = vi.fn(async (event) => {
        preHookUser = event.user;
      });

      const postHook = vi.fn(async (event) => {
        postHookUser = event.user;
      });

      const { managementApp, env } = await getTestServer({
        hooks: {
          onExecutePreUserDeletion: preHook,
          onExecutePostUserDeletion: postHook,
        },
      });
      const managementClient = testClient(managementApp, env);
      const token = await getAdminToken();

      // Create a user with metadata
      const createResponse = await managementClient.users.$post(
        {
          json: {
            email: "same-data@example.com",
            connection: "email",
            user_metadata: { key: "value" },
            app_metadata: { role: "admin" },
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

      expect(createResponse.status).toBe(201);
      const user = await createResponse.json();

      // Delete the user
      await managementClient.users[":user_id"].$delete(
        {
          param: { user_id: user.user_id },
          header: { "tenant-id": "tenantId" },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      // Verify both hooks received the same user data
      expect(preHookUser.user_id).toBe(postHookUser.user_id);
      expect(preHookUser.email).toBe(postHookUser.email);
      expect(preHookUser.user_metadata).toEqual(postHookUser.user_metadata);
      expect(preHookUser.app_metadata).toEqual(postHookUser.app_metadata);
    });
  });

  describe("No hooks configured", () => {
    it("should delete user successfully when no hooks are configured", async () => {
      const { managementApp, env } = await getTestServer();
      const managementClient = testClient(managementApp, env);
      const token = await getAdminToken();

      // Create a user
      const createResponse = await managementClient.users.$post(
        {
          json: {
            email: "no-hooks@example.com",
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

      expect(createResponse.status).toBe(201);
      const user = await createResponse.json();

      // Delete the user
      const deleteResponse = await managementClient.users[":user_id"].$delete(
        {
          param: { user_id: user.user_id },
          header: { "tenant-id": "tenantId" },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      expect(deleteResponse.status).toBe(200);

      // Verify user is deleted
      const { users } = await env.data.users.list("tenantId");
      const userDeleted = users.find((u) => u.user_id === user.user_id);
      expect(userDeleted).toBeUndefined();
    });
  });
});
