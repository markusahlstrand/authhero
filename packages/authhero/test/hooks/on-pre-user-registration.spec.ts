import { describe, it, expect } from "vitest";
import { getTestServer } from "../helpers/test-server";
import {
  HookEvent,
  OnExecutePreUserRegistrationAPI,
} from "../../src/types/Hooks";
import { testClient } from "hono/testing";
import { getAdminToken } from "../helpers/token";

describe("on-pre-user-registration-hook", () => {
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
