import { describe, it, expect } from "vitest";
import { getTestServer } from "../helpers/test-server";
import { HookEvent, OnExecutePostUserUpdateAPI } from "../../src/types/Hooks";
import { testClient } from "hono/testing";
import { getAdminToken } from "../helpers/token";
import { User, Strategy } from "@authhero/adapter-interfaces";

describe("on-post-user-update-hook", () => {
  it("fires after the commit with the persisted user and applied updates", async () => {
    let capturedUser: User | undefined;
    let capturedUpdates: Partial<User> | undefined;

    const { env, managementApp } = await getTestServer({
      hooks: {
        onExecutePostUserUpdate: async (
          event: HookEvent & { user_id: string; updates: Partial<User> },
          _api: OnExecutePostUserUpdateAPI,
        ) => {
          capturedUser = event.user;
          capturedUpdates = event.updates;
        },
      },
    });

    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    const createUserResponse = await client.users.$post(
      {
        json: {
          email: "test-post-update@example.com",
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

    // The hook sees the applied change in `updates`...
    expect(capturedUpdates?.given_name).toBe("Updated Name");
    // ...and the persisted user reflects it (fetched after the commit).
    expect(capturedUser?.given_name).toBe("Updated Name");
    expect(capturedUser?.user_id).toBe(createdUser.user_id);
  });

  it("does not fail the update when the hook throws (update already committed)", async () => {
    const { env, managementApp } = await getTestServer({
      hooks: {
        onExecutePostUserUpdate: async () => {
          throw new Error("post-update hook boom");
        },
      },
    });

    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    const createUserResponse = await client.users.$post(
      {
        json: {
          email: "test-post-update-throw@example.com",
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

    const updateUserResponse = await client.users[":user_id"].$patch(
      {
        json: {
          given_name: "Persisted Despite Hook",
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

    // Update succeeds even though the post-update hook threw.
    expect(updateUserResponse.status).toBe(200);
    const updatedUser = (await updateUserResponse.json()) as Partial<User>;
    expect(updatedUser.given_name).toBe("Persisted Despite Hook");
  });
});
