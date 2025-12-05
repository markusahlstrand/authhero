import { describe, it, expect } from "vitest";
import { getTestServer } from "../helpers/test-server";
import { HookEvent } from "../../src/types/Hooks";
import { testClient } from "hono/testing";
import { getAdminToken } from "../helpers/token";

describe("on-post-user-registration-hook", () => {
  it("should trigger an event", async () => {
    const events: HookEvent[] = [];

    const { env, managementApp } = await getTestServer({
      hooks: {
        onExecutePostUserRegistration: async (event: HookEvent) => {
          events.push(event);
        },
      },
    });

    const client = testClient(managementApp, env);

    const token = await getAdminToken();

    // Create a user via Management API
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

    // The hook should fire once when the user is created
    expect(events.length).toBe(1);
    expect(events[0]?.user.email).toBe("foo2@example.com");
  });
});
