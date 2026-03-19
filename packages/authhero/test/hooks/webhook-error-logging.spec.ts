import { describe, it, expect, afterEach } from "vitest";
import { getTestServer } from "../helpers/test-server";
import { Strategy } from "@authhero/adapter-interfaces";
import { testClient } from "hono/testing";
import http from "node:http";

function createWebhookServer(
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => void,
): Promise<{ url: string; server: http.Server; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as { port: number };
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        server,
        close: () => new Promise<void>((res) => server.close(() => res())),
      });
    });
  });
}

describe("webhook error logging", () => {
  let closeServer: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (closeServer) {
      await closeServer();
      closeServer = undefined;
    }
  });

  it("should log the payload and response when a post-user-registration webhook returns an error", async () => {
    // Start a local HTTP server that returns 500
    const webhookPayloads: any[] = [];
    const { url, close } = await createWebhookServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        webhookPayloads.push(JSON.parse(body));
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Something went wrong" }));
      });
    });
    closeServer = close;

    const { env, oauthApp } = await getTestServer({ mockEmail: true });
    const client = testClient(oauthApp, env);

    // Create a hook pointing at our local error server
    const hook = await env.data.hooks.create("tenantId", {
      url,
      trigger_id: "post-user-registration",
      enabled: true,
      synchronous: false,
    });

    // Trigger a signup which invokes the post-user-registration webhook
    const signupResponse = await client.dbconnections.signup.$post(
      {
        json: {
          email: "webhook-test@example.com",
          password: "Test12345!",
          connection: Strategy.USERNAME_PASSWORD,
          client_id: "clientId",
        },
      },
      {
        headers: {
          "tenant-id": "tenantId",
        },
      },
    );

    expect(signupResponse.status).toBe(200);

    // The webhook should have been called with the user data
    expect(webhookPayloads.length).toBeGreaterThanOrEqual(1);
    const registrationPayload = webhookPayloads.find(
      (p) => p.trigger_id === "post-user-registration",
    );
    expect(registrationPayload).toBeDefined();
    expect(registrationPayload.user.email).toBe("webhook-test@example.com");

    // Wait a moment for async log writes
    await new Promise((r) => setTimeout(r, 100));

    // Fetch logs and find the failed hook log
    const { logs } = await env.data.logs.list("tenantId", {
      page: 0,
      per_page: 100,
      include_totals: false,
    });

    const failedHookLog = logs.find((log) => log.type === "fh");
    expect(failedHookLog).toBeDefined();

    // Description should include the hook id and status
    expect(failedHookLog!.description).toContain(hook.hook_id);
    expect(failedHookLog!.description).toContain("500");

    // user_id should be populated from the webhook data
    expect(failedHookLog!.user_id).toBeTruthy();

    // The webhook details should be stored directly under details
    const details = failedHookLog!.details as any;
    expect(details).toBeDefined();

    expect(details.trigger_id).toBe("post-user-registration");
    expect(details.hook_id).toBe(hook.hook_id);
    expect(details.hook_url).toBe(url);

    // Essential user fields should be included (not full payload)
    expect(details.user_id).toBeTruthy();
    expect(details.user_name).toBe("webhook-test@example.com");
    expect(details.connection).toBe(Strategy.USERNAME_PASSWORD);

    // Response details should be captured
    expect(details.response).toBeDefined();
    expect(details.response.statusCode).toBe(500);
    expect(details.response.body).toContain("Something went wrong");
  });

  it("should log the error when a webhook URL is unreachable", async () => {
    const { env, oauthApp } = await getTestServer({ mockEmail: true });
    const client = testClient(oauthApp, env);

    // Create a hook pointing at an unreachable URL
    const hook = await env.data.hooks.create("tenantId", {
      url: "http://127.0.0.1:1",
      trigger_id: "post-user-registration",
      enabled: true,
      synchronous: false,
    });

    // Trigger a signup
    const signupResponse = await client.dbconnections.signup.$post(
      {
        json: {
          email: "webhook-unreachable@example.com",
          password: "Test12345!",
          connection: Strategy.USERNAME_PASSWORD,
          client_id: "clientId",
        },
      },
      {
        headers: {
          "tenant-id": "tenantId",
        },
      },
    );

    // Signup should still succeed (webhook failures don't block registration)
    expect(signupResponse.status).toBe(200);

    // Wait for async log writes
    await new Promise((r) => setTimeout(r, 200));

    // Fetch logs
    const { logs } = await env.data.logs.list("tenantId", {
      page: 0,
      per_page: 100,
      include_totals: false,
    });

    const failedHookLog = logs.find((log) => log.type === "fh");
    expect(failedHookLog).toBeDefined();

    // Description should include the hook id and the network error
    expect(failedHookLog!.description).toContain(hook.hook_id);

    // user_id should be populated
    expect(failedHookLog!.user_id).toBeTruthy();

    // Details should contain the error info directly
    const details = failedHookLog!.details as any;
    expect(details.error).toBeTruthy();
    expect(details.user_id).toBeTruthy();
    expect(details.user_name).toBe("webhook-unreachable@example.com");
  });

  it("should log user_id and connection from the user object in webhook data", async () => {
    // Start a local HTTP server that returns 403
    const { url, close } = await createWebhookServer((_req, res) => {
      res.writeHead(403, { "Content-Type": "text/plain" });
      res.end("Forbidden");
    });
    closeServer = close;

    const { env, oauthApp } = await getTestServer({ mockEmail: true });
    const client = testClient(oauthApp, env);

    // Create a post-user-login hook (these get the user object with user_id)
    await env.data.hooks.create("tenantId", {
      url,
      trigger_id: "post-user-registration",
      enabled: true,
      synchronous: false,
    });

    // Trigger a signup
    const signupResponse = await client.dbconnections.signup.$post(
      {
        json: {
          email: "webhook-user-info@example.com",
          password: "Test12345!",
          connection: Strategy.USERNAME_PASSWORD,
          client_id: "clientId",
        },
      },
      {
        headers: {
          "tenant-id": "tenantId",
        },
      },
    );

    expect(signupResponse.status).toBe(200);

    await new Promise((r) => setTimeout(r, 100));

    const { logs } = await env.data.logs.list("tenantId", {
      page: 0,
      per_page: 100,
      include_totals: false,
    });

    const failedHookLog = logs.find((log) => log.type === "fh");
    expect(failedHookLog).toBeDefined();

    // user_id should come from the user object in the hook data
    expect(failedHookLog!.user_id).toBeTruthy();
    expect(failedHookLog!.user_id).toContain("|");

    // connection should be populated from user.connection
    expect(failedHookLog!.connection).toBe(Strategy.USERNAME_PASSWORD);

    // Description should mention 403
    expect(failedHookLog!.description).toContain("403");
  });
});
