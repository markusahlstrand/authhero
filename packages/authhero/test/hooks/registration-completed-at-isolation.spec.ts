import { describe, it, expect, afterEach } from "vitest";
import { testClient } from "hono/testing";
import http from "node:http";
import { Strategy } from "@authhero/adapter-interfaces";
import { getAdminToken } from "../helpers/token";
import { getTestServer } from "../helpers/test-server";

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

describe("registration_completed_at is internal-only", () => {
  let closeServer: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (closeServer) {
      await closeServer();
      closeServer = undefined;
    }
  });

  it("management API responses omit registration_completed_at", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    const createRes = await managementClient.users.$post(
      {
        json: {
          email: "internal-flag@example.com",
          connection: "email",
          provider: "email",
        },
        header: { "tenant-id": "tenantId" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as Record<string, unknown>;
    expect("registration_completed_at" in created).toBe(false);
    const userId = created.user_id as string;

    // Simulate the finalizer having stamped the field internally.
    await env.data.users.update("tenantId", userId, {
      registration_completed_at: new Date().toISOString(),
    });

    // The DB row really has the field set.
    const internalUser = await env.data.users.get("tenantId", userId);
    expect(internalUser?.registration_completed_at).toBeTruthy();

    // GET /users/:user_id must hide it.
    const getRes = await managementClient.users[":user_id"].$get(
      {
        param: { user_id: userId },
        header: { "tenant-id": "tenantId" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(getRes.status).toBe(200);
    const fetched = (await getRes.json()) as Record<string, unknown>;
    expect("registration_completed_at" in fetched).toBe(false);

    // GET /users (list) must hide it.
    const listRes = await managementClient.users.$get(
      {
        query: {},
        header: { "tenant-id": "tenantId" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(listRes.status).toBe(200);
    const list = (await listRes.json()) as Array<Record<string, unknown>>;
    const hit = list.find((u) => u.user_id === userId);
    expect(hit).toBeDefined();
    expect("registration_completed_at" in (hit as object)).toBe(false);

    // PATCH /users/:user_id must hide it.
    const patchRes = await managementClient.users[":user_id"].$patch(
      {
        param: { user_id: userId },
        header: { "tenant-id": "tenantId" },
        json: { name: "Updated" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(patchRes.status).toBe(200);
    const patched = (await patchRes.json()) as Record<string, unknown>;
    expect("registration_completed_at" in patched).toBe(false);
  });

  it("post-user-registration webhook payload omits registration_completed_at", async () => {
    const webhookCalls: Array<Record<string, unknown>> = [];

    const { url, close } = await createWebhookServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          webhookCalls.push(JSON.parse(body));
        } catch {
          // ignore
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      });
    });
    closeServer = close;

    const { env, oauthApp } = await getTestServer({ mockEmail: true });
    const oauthClient = testClient(oauthApp, env);

    await env.data.hooks.create("tenantId", {
      url,
      trigger_id: "post-user-registration",
      enabled: true,
      synchronous: false,
    });

    const signupResponse = await oauthClient.dbconnections.signup.$post(
      {
        json: {
          email: "webhook-payload@example.com",
          password: "Test12345!",
          connection: Strategy.USERNAME_PASSWORD,
          client_id: "clientId",
        },
      },
      { headers: { "tenant-id": "tenantId" } },
    );
    expect(signupResponse.status).toBe(200);

    const regCall = webhookCalls.find(
      (c) => c.trigger_id === "post-user-registration",
    );
    expect(regCall).toBeDefined();
    const userPayload = (regCall as { user?: Record<string, unknown> }).user;
    expect(userPayload).toBeDefined();
    expect("registration_completed_at" in (userPayload as object)).toBe(false);
  });
});
