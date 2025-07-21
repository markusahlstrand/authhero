import { describe, it, expect } from "vitest";
import { getTestServer } from "../helpers/test-server";
import { HookEvent, OnExecutePreUserUpdateAPI } from "../../src/types/Hooks";
import { testClient } from "hono/testing";
import { getAdminToken } from "../helpers/token";
import { User } from "@authhero/adapter-interfaces";

describe("on-pre-user-update-hook", () => {
  it("should update user metadata", async () => {
    const { env, managementApp } = await getTestServer({
      hooks: {
        onExecutePreUserUpdate: async (
          _: HookEvent & { user_id: string; updates: Partial<User> },
          api: OnExecutePreUserUpdateAPI,
        ) => {
          api.user.setUserMetadata("name", "Name update from hook");
        },
      },
    });

    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    // Create a user first
    const createUserResponse = await client.users.$post(
      {
        json: {
          email: "test-update@example.com",
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

    // Update the user
    const updateUserResponse = await client.users[":user_id"].$patch(
      {
        json: {
          given_name: "Updated Name",
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

    expect(updateUserResponse.status).toBe(200);
    const updatedUser = (await updateUserResponse.json()) as Partial<User>;

    // Verify the original update was applied
    expect(updatedUser.given_name).toBe("Updated Name");

    // Verify the hook metadata was added
    expect(updatedUser?.name).toBe("Name update from hook");
  });

  it("should cancel update when hook throws an error", async () => {
    const { env, managementApp } = await getTestServer({
      hooks: {
        onExecutePreUserUpdate: async () => {
          throw new Error("User update cancelled by pre-update hook");
        },
      },
    });

    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    // Create a user first
    const createUserResponse = await client.users.$post(
      {
        json: {
          email: "test-cancel@example.com",
          name: "Original Name",
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

    // Try to update the user with blocked status (should be canceled)
    const updateUserResponse = await client.users[":user_id"].$patch(
      {
        json: {
          given_name: "Should Not Update",
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

    // The update should be rejected
    expect(updateUserResponse.status).toBe(400);

    const errorResponse = await updateUserResponse.text();
    expect(errorResponse).toBe("Pre user update hook failed");

    // Verify the user was not updated by fetching it again
    const getUserResponse = await client.users[":user_id"].$get(
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

    expect(getUserResponse.status).toBe(200);
    const unchangedUser = await getUserResponse.json();

    // User should still have original values
    expect(unchangedUser.name).toBe("Original Name");
  });
});
