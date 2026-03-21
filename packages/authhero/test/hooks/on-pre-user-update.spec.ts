import { describe, it, expect } from "vitest";
import { getTestServer } from "../helpers/test-server";
import { HookEvent, OnExecutePreUserUpdateAPI } from "../../src/types/Hooks";
import { testClient } from "hono/testing";
import { getAdminToken } from "../helpers/token";
import { User, Strategy } from "@authhero/adapter-interfaces";
import { USERNAME_PASSWORD_PROVIDER } from "../../src/constants";

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
          connection: Strategy.USERNAME_PASSWORD,
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
          connection: Strategy.USERNAME_PASSWORD,
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

    const errorResponse = await updateUserResponse.json();
    expect(errorResponse).toEqual({ message: "Pre user update hook failed" });

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

  it("should NOT call pre-user-update hook when email conflict returns 409", async () => {
    let hookCalled = false;
    const { env, managementApp } = await getTestServer({
      hooks: {
        onExecutePreUserUpdate: async () => {
          hookCalled = true;
        },
      },
    });

    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    // Create two users with different emails
    await env.data.users.create("tenantId", {
      user_id: `${USERNAME_PASSWORD_PROVIDER}|user1`,
      email: "user1@example.com",
      email_verified: true,
      provider: USERNAME_PASSWORD_PROVIDER,
      connection: Strategy.USERNAME_PASSWORD,
      is_social: false,
    });

    await env.data.users.create("tenantId", {
      user_id: `${USERNAME_PASSWORD_PROVIDER}|user2`,
      email: "user2@example.com",
      email_verified: true,
      provider: USERNAME_PASSWORD_PROVIDER,
      connection: Strategy.USERNAME_PASSWORD,
      is_social: false,
    });

    // Try to update user1's email to user2's email — should fail before hooks fire
    const updateResponse = await client.users[":user_id"].$patch(
      {
        param: { user_id: `${USERNAME_PASSWORD_PROVIDER}|user1` },
        json: { email: "user2@example.com" },
        header: { "tenant-id": "tenantId" },
      },
      {
        headers: { authorization: `Bearer ${token}` },
      },
    );

    expect(updateResponse.status).toBe(409);
    expect(hookCalled).toBe(false);
  });

  it("should NOT call pre-user-update hook when phone_number conflict returns 409", async () => {
    let hookCalled = false;
    const { env, managementApp } = await getTestServer({
      hooks: {
        onExecutePreUserUpdate: async () => {
          hookCalled = true;
        },
      },
    });

    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    // Create two users with different phone numbers
    await env.data.users.create("tenantId", {
      user_id: "sms|user1",
      phone_number: "+1234567890",
      provider: "sms",
      connection: "sms",
      is_social: false,
    });

    await env.data.users.create("tenantId", {
      user_id: "sms|user2",
      phone_number: "+0987654321",
      provider: "sms",
      connection: "sms",
      is_social: false,
    });

    // Try to update user1's phone to user2's phone — should fail before hooks fire
    const updateResponse = await client.users[":user_id"].$patch(
      {
        param: { user_id: "sms|user1" },
        json: { phone_number: "+0987654321" },
        header: { "tenant-id": "tenantId" },
      },
      {
        headers: { authorization: `Bearer ${token}` },
      },
    );

    expect(updateResponse.status).toBe(409);
    expect(hookCalled).toBe(false);
  });
});
