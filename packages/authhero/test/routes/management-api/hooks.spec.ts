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

  // Form hooks are dispatched from `postUserLoginHook` and nowhere else, so a
  // form hook on any other trigger stores cleanly and then never runs — which
  // looks exactly like a broken form.
  describe("form hook triggers", () => {
    it("should reject creating a form hook on a trigger that never dispatches it", async () => {
      const { managementApp, env } = await getTestServer();
      const managementClient = testClient(managementApp, env);
      const token = await getAdminToken();

      const response = await managementClient.hooks.$post(
        {
          json: {
            form_id: "form_profile_completion",
            // @ts-expect-error - form hooks only accept post-user-login
            trigger_id: "post-user-registration",
          },
          header: { "tenant-id": "tenantId" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(400);
    });

    it("should accept a form hook on post-user-login", async () => {
      const { managementApp, env } = await getTestServer();
      const managementClient = testClient(managementApp, env);
      const token = await getAdminToken();

      const response = await managementClient.hooks.$post(
        {
          json: {
            form_id: "form_profile_completion",
            trigger_id: "post-user-login",
          },
          header: { "tenant-id": "tenantId" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(201);
      const created = (await response.json()) as Hook;
      expect(created.trigger_id).toBe("post-user-login");
    });

    it("should reject moving a stored form hook onto another trigger", async () => {
      const { managementApp, env } = await getTestServer();
      const managementClient = testClient(managementApp, env);
      const token = await getAdminToken();

      const hook = await env.data.hooks.create("tenantId", {
        hook_id: "hook_form_trigger_patch",
        form_id: "form_profile_completion",
        trigger_id: "post-user-login",
        enabled: true,
        synchronous: false,
      });

      // The PATCH body is a union of partial variant schemas, so this passes
      // request validation — the handler has to catch it against the stored row.
      const response = await managementClient.hooks[":id"].$patch(
        {
          param: { id: hook.hook_id },
          json: { trigger_id: "post-user-registration" },
          header: { "tenant-id": "tenantId" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(400);

      const stored = await env.data.hooks.get("tenantId", hook.hook_id);
      expect(stored?.trigger_id).toBe("post-user-login");
    });

    it("should still allow editing a hook already stored on an unsupported trigger", async () => {
      const { managementApp, env } = await getTestServer();
      const managementClient = testClient(managementApp, env);
      const token = await getAdminToken();

      const hook = await env.data.hooks.create("tenantId", {
        hook_id: "hook_form_trigger_legacy",
        form_id: "form_profile_completion",
        trigger_id: "post-user-login",
        enabled: true,
        synchronous: false,
      });
      // Simulate a row stored before the trigger list was narrowed. The update
      // adapter takes a partial, which still admits the webhook variant's
      // wider trigger set.
      await env.data.hooks.update("tenantId", hook.hook_id, {
        trigger_id: "post-user-registration",
      });

      // Re-submitting the same (now unsupported) trigger must not bounce the
      // edit — otherwise a dead hook could never even be disabled.
      const response = await managementClient.hooks[":id"].$patch(
        {
          param: { id: hook.hook_id },
          json: {
            enabled: false,
            trigger_id: "post-user-registration",
          },
          header: { "tenant-id": "tenantId" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(200);
      const stored = await env.data.hooks.get("tenantId", hook.hook_id);
      expect(stored?.enabled).toBe(false);
    });
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
