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

    // Create a user
    const userResponse = await client.users.$post(
      {
        json: {
          email: "foo2@example.com",
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

    expect(events.length).toBe(1);
  });
});
