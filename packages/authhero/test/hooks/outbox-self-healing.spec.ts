import { describe, it, expect, afterEach } from "vitest";
import { getTestServer } from "../helpers/test-server";
import { Strategy } from "@authhero/adapter-interfaces";
import { testClient } from "hono/testing";
import http from "node:http";
import { drainOutbox } from "../../src/helpers/outbox-relay";
import { LogsDestination } from "../../src/helpers/outbox-destinations/logs";
import { WebhookDestination } from "../../src/helpers/outbox-destinations/webhooks";
import { RegistrationFinalizerDestination } from "../../src/helpers/outbox-destinations/registration-finalizer";

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

describe("post-user-registration is only enqueued on creation", () => {
  let closeServer: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (closeServer) {
      await closeServer();
      closeServer = undefined;
    }
  });

  it("login does not re-enqueue post-user-registration, even after dead-letter", async () => {
    // Delivery reliability for post-user-registration is owned by the outbox
    // (retry + dead-letter). The login path must NOT re-enqueue on behalf of
    // a failed registration — that would double-fire the hook on every first
    // login while the original event is still pending in the outbox, and it
    // conflates "pending delivery" with "lost delivery". Recovery of
    // dead-lettered events is an explicit admin/cron concern.

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

    const { env, oauthApp } = await getTestServer({
      mockEmail: true,
      outbox: true,
    });
    const oauthClient = testClient(oauthApp, env);

    await env.data.hooks.create("tenantId", {
      url,
      trigger_id: "post-user-registration",
      enabled: true,
      synchronous: false,
    });

    // Signup — webhook fails on delivery.
    const signupResponse = await oauthClient.dbconnections.signup.$post(
      {
        json: {
          email: "no-self-heal@example.com",
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

    // Drive the outbox to dead-letter (maxRetries=1).
    await new Promise((r) => setTimeout(r, 2200));

    const destinations = [
      new LogsDestination(env.data.logs),
      new WebhookDestination(env.data.hooks, async () => "dummy-token"),
      new RegistrationFinalizerDestination(env.data.users),
    ];

    await drainOutbox(env.data.outbox!, destinations, { maxRetries: 1 });

    const failed = await env.data.outbox!.listFailed("tenantId");
    const deadEvent = failed.events.find(
      (e) => e.event_type === "hook.post-user-registration",
    );
    expect(deadEvent).toBeDefined();

    // Login — even with the webhook now responsive, the login path must not
    // re-enqueue. Re-driving the dead-lettered event is outside this flow.
    webhookMode = "succeed";
    webhookCalls.length = 0;

    const loginResponse = await oauthClient.co.authenticate.$post({
      json: {
        client_id: "clientId",
        credential_type: "http://auth0.com/oauth/grant-type/password-realm",
        realm: Strategy.USERNAME_PASSWORD,
        password: "Test12345!",
        username: "no-self-heal@example.com",
      },
    });
    expect(loginResponse.status).toBe(200);

    // Drain the outbox so any event that the login path might have
    // re-enqueued is actually delivered — without this, a regression that
    // re-enqueues on login would sit pending and silently pass the
    // assertion below.
    await drainOutbox(env.data.outbox!, destinations, { maxRetries: 1 });

    const noopCall = webhookCalls.find(
      (c) => c.trigger_id === "post-user-registration",
    );
    expect(noopCall).toBeUndefined();
  });
});
