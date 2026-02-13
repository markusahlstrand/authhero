import { describe, it, expect } from "vitest";
import { getTestServer } from "../helpers/test-server";
import {
  HookEvent,
  OnExecutePreUserRegistrationAPI,
} from "../../src/types/Hooks";
import { testClient } from "hono/testing";
import { getAdminToken } from "../helpers/token";
import { UserResponse } from "@authhero/adapter-interfaces";

describe("on-pre-user-registration-hook", () => {
  it("should link user to primary via setLinkedTo", async () => {
    let primaryUserId: string | undefined;

    const { env, managementApp } = await getTestServer({
      hooks: {
        onExecutePreUserRegistration: async (
          _: HookEvent,
          api: OnExecutePreUserRegistrationAPI,
        ) => {
          // Link to the primary user when creating a new user
          if (primaryUserId) {
            api.user.setLinkedTo(primaryUserId);
          }
        },
      },
    });

    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    // Create a primary user first
    const primaryResponse = await client.users.$post(
      {
        json: {
          email: "primary@example.com",
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

    expect(primaryResponse.status).toBe(201);
    const primaryUser = (await primaryResponse.json()) as UserResponse;
    primaryUserId = primaryUser.user_id;

    // Create a secondary user that will be linked to the primary
    const secondaryResponse = await client.users.$post(
      {
        json: {
          email: "secondary@example.com",
          connection: "google-oauth2",
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

    expect(secondaryResponse.status).toBe(201);
    // The returned user should be the primary user with the new identity linked
    const returnedUser = (await secondaryResponse.json()) as UserResponse;
    expect(returnedUser.user_id).toBe(primaryUserId);
    expect(returnedUser.identities).toHaveLength(2);
  });

  it("should update user metadata", async () => {
    const { env, managementApp } = await getTestServer({
      hooks: {
        onExecutePreUserRegistration: async (
          _: HookEvent,
          api: OnExecutePreUserRegistrationAPI,
        ) => {
          api.user.setUserMetadata("given_name", "given_name");
        },
      },
    });

    const client = testClient(managementApp, env);

    const token = await getAdminToken();

    // Create a user
    const userResponse = await client.users.$post(
      {
        json: {
          email: "foo2@example.com",
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

    expect(userResponse.status).toBe(201);
    const user = await userResponse.json();

    expect(user?.given_name).toBe("given_name");
  });
});
