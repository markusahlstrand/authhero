import { describe, it, expect, afterEach } from "vitest";
import { getTestServer } from "../helpers/test-server";
import { getAdminToken } from "../helpers/token";
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
    // This test must wait out the outbox retry-backoff window (~1s base delay)
    // before draining to dead-letter, on top of two HTTP round-trips and two
    // drains. That comfortably exceeds the 5s default under parallel load, so
    // give it explicit headroom rather than flake.
  }, 20000);
});

describe("post-user-registration recovers end to end", () => {
  let closeServer: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (closeServer) {
      await closeServer();
      closeServer = undefined;
    }
  });

  it("dead-letters a failed registration hook, recovers it on admin retry, and then stays quiet", async () => {
    // The whole self-healing cycle in one flow (#951). The individual pieces
    // each have unit coverage; what this proves is the composition.
    //
    //   1. Signup with the webhook down — the event goes to the outbox.
    //   2. The relay retries and dead-letters it (maxRetries=1 in the fixture).
    //   3. A login while it is dead-lettered changes nothing: recovery is not
    //      the login path's job.
    //   4. The webhook comes back and an operator replays the event through
    //      POST /api/v2/failed-events/{id}/retry — it delivers, and the
    //      finalizer stamps `registration_completed_at`.
    //   5. A later login is a no-op — nothing is re-enqueued or re-delivered.

    let webhookMode: "fail" | "succeed" = "fail";
    const webhookCalls: Array<Record<string, unknown>> = [];

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

    const { env, oauthApp, managementApp } = await getTestServer({
      mockEmail: true,
      outbox: true,
    });
    const oauthClient = testClient(oauthApp, env);
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    const destinations = [
      new LogsDestination(env.data.logs),
      new WebhookDestination(env.data.hooks, async () => "dummy-token"),
      // Listed last on purpose: the finalizer must only run once the
      // delivering destinations have succeeded.
      new RegistrationFinalizerDestination(env.data.users),
    ];

    await env.data.hooks.create("tenantId", {
      url,
      trigger_id: "post-user-registration",
      enabled: true,
      synchronous: false,
    });

    // 1. Signup while the webhook is returning 500.
    const signupResponse = await oauthClient.dbconnections.signup.$post(
      {
        json: {
          email: "self-heal@example.com",
          password: "Test12345!",
          connection: Strategy.USERNAME_PASSWORD,
          client_id: "clientId",
        },
      },
      { headers: { "tenant-id": "tenantId" } },
    );
    expect(signupResponse.status).toBe(200);

    // 2. Wait out the retry backoff, then drain so the exhausted event
    //    dead-letters rather than sitting pending.
    await new Promise((r) => setTimeout(r, 2200));
    await drainOutbox(env.data.outbox!, destinations, { maxRetries: 1 });

    const failed = await env.data.outbox!.listFailed("tenantId");
    const deadEvent = failed.events.find(
      (e) => e.event_type === "hook.post-user-registration",
    );
    expect(deadEvent).toBeDefined();

    // The finalizer never ran, so the user is still unfinished — this is the
    // flag the recovery path exists to set.
    const userId = deadEvent!.target?.id;
    if (!userId) throw new Error("dead-lettered event has no target user");
    const beforeRecovery = await env.data.users.get("tenantId", userId);
    expect(beforeRecovery?.registration_completed_at).toBeFalsy();

    // 3. A login while the event is dead-lettered must not re-enqueue it, even
    //    though the webhook is about to come back. Recovery is explicit.
    const loginDuringOutage = await oauthClient.co.authenticate.$post({
      json: {
        client_id: "clientId",
        credential_type: "http://auth0.com/oauth/grant-type/password-realm",
        realm: Strategy.USERNAME_PASSWORD,
        password: "Test12345!",
        username: "self-heal@example.com",
      },
    });
    expect(loginDuringOutage.status).toBe(200);
    await drainOutbox(env.data.outbox!, destinations, { maxRetries: 1 });

    const stillFailed = await env.data.outbox!.listFailed("tenantId");
    expect(stillFailed.events.some((e) => e.id === deadEvent!.id)).toBe(true);
    const afterLogin = await env.data.users.get("tenantId", userId);
    expect(afterLogin?.registration_completed_at).toBeFalsy();

    // 4. Webhook back online; an operator replays the dead-lettered event.
    webhookMode = "succeed";
    webhookCalls.length = 0;

    const retryResponse = await (managementClient["failed-events"] as any)[
      ":id"
    ].retry.$post(
      {
        param: { id: deadEvent!.id },
        header: { "tenant-id": "tenantId" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(retryResponse.status).toBe(200);

    await drainOutbox(env.data.outbox!, destinations, { maxRetries: 1 });

    // The hook actually fired this time...
    const deliveredCall = webhookCalls.find(
      (c) => c.trigger_id === "post-user-registration",
    );
    expect(deliveredCall).toBeDefined();

    // ...and only then did the finalizer stamp the user.
    const recovered = await env.data.users.get("tenantId", userId);
    expect(recovered?.registration_completed_at).toBeTruthy();

    // Nothing is left in the dead-letter queue.
    const failedAfterRecovery = await env.data.outbox!.listFailed("tenantId");
    expect(failedAfterRecovery.events.some((e) => e.id === deadEvent!.id)).toBe(
      false,
    );

    // 5. A subsequent login is a no-op: no new registration event, and the
    //    already-delivered one is not delivered twice.
    webhookCalls.length = 0;
    const secondLogin = await oauthClient.co.authenticate.$post({
      json: {
        client_id: "clientId",
        credential_type: "http://auth0.com/oauth/grant-type/password-realm",
        realm: Strategy.USERNAME_PASSWORD,
        password: "Test12345!",
        username: "self-heal@example.com",
      },
    });
    expect(secondLogin.status).toBe(200);

    // Drain so a regression that re-enqueued would actually deliver rather
    // than sit pending and pass this assertion by accident.
    await drainOutbox(env.data.outbox!, destinations, { maxRetries: 1 });

    expect(
      webhookCalls.find((c) => c.trigger_id === "post-user-registration"),
    ).toBeUndefined();
    // The stamp is not rewritten either.
    const finalUser = await env.data.users.get("tenantId", userId);
    expect(finalUser?.registration_completed_at).toBe(
      recovered?.registration_completed_at,
    );

    // Same budget reasoning as the sibling test: a ~1s retry-backoff wait plus
    // several HTTP round-trips and four drains needs headroom over the 5s
    // default under parallel load.
  }, 30000);
});
