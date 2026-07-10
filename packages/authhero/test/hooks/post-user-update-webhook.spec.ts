import { describe, it, expect, afterEach } from "vitest";
import http from "node:http";
import { testClient } from "hono/testing";
import { Strategy, User } from "@authhero/adapter-interfaces";
import { getTestServer } from "../helpers/test-server";
import { getAdminToken } from "../helpers/token";

/**
 * End-to-end coverage for issue #1086: a user update must emit a
 * `hook.post-user-update` outbox event and deliver it to webhooks registered
 * for the `post-user-update` trigger — mirroring the existing
 * post-user-registration / post-user-deletion webhook delivery.
 */

function createWebhookServer(
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => void,
): Promise<{ url: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as { port: number };
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        close: () => new Promise<void>((res) => server.close(() => res())),
      });
    });
  });
}

describe("post-user-update webhook delivery", () => {
  let closeServer: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (closeServer) {
      await closeServer();
      closeServer = undefined;
    }
  });

  it("delivers a post-user-update webhook with the committed user when a user is updated", async () => {
    const webhookCalls: Array<{ trigger_id: string; user: User }> = [];

    const { url, close } = await createWebhookServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          webhookCalls.push(JSON.parse(body));
        } catch {
          // ignore parse errors
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      });
    });
    closeServer = close;

    const { env, managementApp } = await getTestServer({ outbox: true });
    const client = testClient(managementApp, env);
    const token = await getAdminToken();

    await env.data.hooks.create("tenantId", {
      url,
      trigger_id: "post-user-update",
      enabled: true,
      synchronous: false,
    });

    const createUserResponse = await client.users.$post(
      {
        json: {
          email: "post-update-webhook@example.com",
          connection: Strategy.USERNAME_PASSWORD,
        },
        header: { "tenant-id": "tenantId" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(createUserResponse.status).toBe(201);
    const createdUser = await createUserResponse.json();

    const updateUserResponse = await client.users[":user_id"].$patch(
      {
        json: { given_name: "Updated Name" },
        header: { "tenant-id": "tenantId" },
        param: { user_id: createdUser.user_id },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(updateUserResponse.status).toBe(200);

    // The webhook received the update event with the persisted change.
    const updateCall = webhookCalls.find(
      (c) => c.trigger_id === "post-user-update",
    );
    expect(updateCall).toBeDefined();
    expect(updateCall?.user.user_id).toBe(createdUser.user_id);
    expect(updateCall?.user.given_name).toBe("Updated Name");

    // The event was delivered, not dead-lettered.
    const failed = await env.data.outbox!.listFailed("tenantId");
    const deadLettered = failed.events.find(
      (e) => e.event_type === "hook.post-user-update",
    );
    expect(deadLettered).toBeUndefined();
  });
});
