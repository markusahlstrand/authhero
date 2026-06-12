import { describe, it, expect, afterEach } from "vitest";
import http from "node:http";
import { testClient } from "hono/testing";
import { getAdminToken } from "../../helpers/token";
import { getTestServer } from "../../helpers/test-server";
import { Hook } from "@authhero/adapter-interfaces";

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

describe("hooks", () => {
  it("should support crud", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);

    const token = await getAdminToken();

    // --------------------------------------------
    // POST
    // --------------------------------------------
    const createHooksResponse = await managementClient.hooks.$post(
      {
        json: {
          url: "https://example.com/hook",
          trigger_id: "pre-user-registration",
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

    expect(createHooksResponse.status).toBe(201);
    const createdHook = await createHooksResponse.json();

    const { created_at, updated_at, hook_id, ...rest } = createdHook;

    expect(rest).toEqual({
      url: "https://example.com/hook",
      trigger_id: "pre-user-registration",
      enabled: false,
      synchronous: false,
    });
    expect(created_at).toBeTypeOf("string");
    expect(updated_at).toBeTypeOf("string");
    expect(hook_id).toBeTypeOf("string");

    // --------------------------------------------
    // PATCH
    // --------------------------------------------
    const updateHookResponse = await managementClient.hooks[":id"].$patch(
      {
        param: {
          id: hook_id!,
        },
        json: {
          url: "https://example.com/hook2",
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

    expect(updateHookResponse.status).toBe(200);
    const updatedHook = (await updateHookResponse.json()) as Hook;
    expect(updatedHook.url).toEqual("https://example.com/hook2");

    // --------------------------------------------
    // DELETE
    // --------------------------------------------
    const deleteHookResponse = await managementClient.hooks[":id"].$delete(
      {
        param: {
          id: hook_id!,
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

    expect(deleteHookResponse.status).toBe(200);

    // --------------------------------------------
    // LIST
    // --------------------------------------------
    const listHooksResponse = await managementClient.hooks.$get(
      {
        query: {},
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

    expect(listHooksResponse.status).toBe(200);
    const hooks = await listHooksResponse.json();
    expect(hooks).toEqual([]);
  });

  describe("try", () => {
    let closeServer: (() => Promise<void>) | undefined;

    afterEach(async () => {
      if (closeServer) {
        await closeServer();
        closeServer = undefined;
      }
    });

    it("should invoke a webhook for a specific user and return the response", async () => {
      const webhookCalls: Array<{
        body: {
          tenant_id: string;
          trigger_id: string;
          user: { user_id: string };
        };
        authorization: string | undefined;
      }> = [];

      const { url, close } = await createWebhookServer((req, res) => {
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => {
          webhookCalls.push({
            body: JSON.parse(body),
            authorization: req.headers.authorization,
          });
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ received: true }));
        });
      });
      closeServer = close;

      const { managementApp, env } = await getTestServer();
      const managementClient = testClient(managementApp, env);
      const token = await getAdminToken();

      // A disabled hook can still be tried — that's the point of testing it
      // before turning it on.
      const hook = await env.data.hooks.create("tenantId", {
        hook_id: "hook_try_test",
        url,
        trigger_id: "post-user-login",
        enabled: false,
        synchronous: false,
      });

      const tryResponse = await managementClient.hooks[":hook_id"].try.$post(
        {
          param: { hook_id: hook.hook_id },
          json: { user_id: "email|userId" },
          header: { "tenant-id": "tenantId" },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      expect(tryResponse.status).toBe(200);
      const result = await tryResponse.json();
      expect(result).toEqual({ ok: true, status: 200 });

      expect(webhookCalls).toHaveLength(1);
      const call = webhookCalls[0]!;
      expect(call.body.tenant_id).toBe("tenantId");
      expect(call.body.trigger_id).toBe("post-user-login");
      expect(call.body.user.user_id).toBe("email|userId");
      expect(call.authorization).toMatch(/^Bearer /);
    });

    it("should return 404 for an unknown user", async () => {
      const { managementApp, env } = await getTestServer();
      const managementClient = testClient(managementApp, env);
      const token = await getAdminToken();

      await env.data.hooks.create("tenantId", {
        hook_id: "hook_try_missing_user",
        url: "https://example.com/hook",
        trigger_id: "post-user-login",
        enabled: true,
        synchronous: false,
      });

      const tryResponse = await managementClient.hooks[":hook_id"].try.$post(
        {
          param: { hook_id: "hook_try_missing_user" },
          json: { user_id: "email|unknown" },
          header: { "tenant-id": "tenantId" },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      expect(tryResponse.status).toBe(404);
    });
  });
});
