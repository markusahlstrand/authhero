import { describe, it, expect, afterEach } from "vitest";
import { getTestServer } from "../helpers/test-server";
import { Strategy } from "@authhero/adapter-interfaces";
import { testClient } from "hono/testing";
import { getAdminToken } from "../helpers/token";
import http from "node:http";
import bcryptjs from "bcryptjs";
import { drainOutbox } from "../../src/helpers/outbox-relay";
import { LogsDestination } from "../../src/helpers/outbox-destinations/logs";
import { WebhookDestination } from "../../src/helpers/outbox-destinations/webhooks";
import { RegistrationFinalizerDestination } from "../../src/helpers/outbox-destinations/registration-finalizer";
import { USERNAME_PASSWORD_PROVIDER } from "../../src/constants";

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

describe("outbox self-healing pipeline", () => {
  let closeServer: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (closeServer) {
      await closeServer();
      closeServer = undefined;
    }
  });

  it("signup with failing webhook → dead-letter → login re-enqueue → success → no-op", async () => {
    // --- controllable webhook server ---
    let webhookMode: "fail" | "succeed" = "fail";
    const webhookCalls: any[] = [];

    const { url, close } = await createWebhookServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          webhookCalls.push(JSON.parse(body));
        } catch {
          // ignore parse errors
        }
        if (webhookMode === "fail") {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Webhook down" }));
        } else {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        }
      });
    });
    closeServer = close;

    // --- test server with outbox enabled ---
    const { env, oauthApp, managementApp } = await getTestServer({
      mockEmail: true,
      outbox: true,
    });
    const oauthClient = testClient(oauthApp, env);

    // Register a post-user-registration webhook hook
    await env.data.hooks.create("tenantId", {
      url,
      trigger_id: "post-user-registration",
      enabled: true,
      synchronous: false,
    });

    // --- 1. Signup (webhook will fail) ---
    const signupResponse = await oauthClient.dbconnections.signup.$post(
      {
        json: {
          email: "self-heal@example.com",
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
    const signupBody = (await signupResponse.json()) as { _id: string };
    const userId = signupBody._id;

    // Webhook was called but failed
    const regCall = webhookCalls.find(
      (c) => c.trigger_id === "post-user-registration",
    );
    expect(regCall).toBeDefined();

    // User should NOT have registration_completed_at yet
    const user1 = await env.data.users.get("tenantId", userId);
    expect(user1).toBeTruthy();
    expect(user1!.registration_completed_at).toBeFalsy();

    // --- 2. Drain outbox → dead-letter (maxRetries=1) ---
    // Wait for retry_at to pass (the backoff is 1s for retry_count=0 → 2s for retry_count=1)
    await new Promise((r) => setTimeout(r, 2200));

    // Build destinations for draining
    const destinations = [
      new LogsDestination(env.data.logs),
      new WebhookDestination(env.data.hooks, async () => "dummy-token"),
      new RegistrationFinalizerDestination(env.data.users),
    ];

    await drainOutbox(env.data.outbox!, destinations, { maxRetries: 1 });

    // Event should now be dead-lettered
    const failed = await env.data.outbox!.listFailed("tenantId");
    expect(failed.events.length).toBeGreaterThanOrEqual(1);
    const deadEvent = failed.events.find(
      (e) => e.event_type === "hook.post-user-registration",
    );
    expect(deadEvent).toBeDefined();

    // User still not finalized
    const user2 = await env.data.users.get("tenantId", userId);
    expect(user2!.registration_completed_at).toBeFalsy();

    // --- 3. Switch webhook to succeed, login ---
    webhookMode = "succeed";
    webhookCalls.length = 0;

    const loginResponse = await oauthClient.co.authenticate.$post({
      json: {
        client_id: "clientId",
        credential_type: "http://auth0.com/oauth/grant-type/password-realm",
        realm: Strategy.USERNAME_PASSWORD,
        password: "Test12345!",
        username: "self-heal@example.com",
      },
    });
    expect(loginResponse.status).toBe(200);

    // The postUserLoginHook should have re-enqueued the post-user-registration
    // event (because registration_completed_at was null). The per-request
    // outbox processing (flushed by flushBackgroundPromises in test mode)
    // should have delivered it successfully, and RegistrationFinalizerDestination
    // should have set registration_completed_at.

    // --- 4. Assert registration completed ---
    const user3 = await env.data.users.get("tenantId", userId);
    expect(user3!.registration_completed_at).toBeTruthy();

    // Webhook was called successfully
    const successCall = webhookCalls.find(
      (c) => c.trigger_id === "post-user-registration",
    );
    expect(successCall).toBeDefined();

    // --- 5. Login again → no-op (no re-enqueue) ---
    webhookCalls.length = 0;

    const login2Response = await oauthClient.co.authenticate.$post({
      json: {
        client_id: "clientId",
        credential_type: "http://auth0.com/oauth/grant-type/password-realm",
        realm: Strategy.USERNAME_PASSWORD,
        password: "Test12345!",
        username: "self-heal@example.com",
      },
    });
    expect(login2Response.status).toBe(200);

    // No post-user-registration webhook should fire this time
    const noopCall = webhookCalls.find(
      (c) => c.trigger_id === "post-user-registration",
    );
    expect(noopCall).toBeUndefined();
  });
});
