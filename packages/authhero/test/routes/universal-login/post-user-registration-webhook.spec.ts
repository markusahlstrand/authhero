import { describe, it, expect, afterEach } from "vitest";
import http from "node:http";
import { testClient } from "hono/testing";
import {
  AuthorizationResponseType,
  AuthorizationResponseMode,
} from "@authhero/adapter-interfaces";
import { getTestServer } from "../../helpers/test-server";

/**
 * Regression test for universal-login outbox wiring.
 *
 * `/u/login/email-otp-challenge` creates a user when the OTP is verified for
 * an email that doesn't yet exist. That handler calls `enqueuePostHookEvent`
 * which pushes a `hook.post-user-registration` event to the outbox. If the
 * universal-login `outboxMiddleware` is only wired with `LogsDestination`
 * (which rejects `hook.*` events), the relay finds no destination that
 * accepts the event and dead-letters it immediately with
 * "No destination accepts event_type=hook.post-user-registration" — so
 * webhooks never fire for users registered via universal-login.
 *
 * The universal-login apps must mirror auth-api's destination list:
 * LogsDestination + WebhookDestination + RegistrationFinalizerDestination.
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

describe("universal-login post-user-registration webhook delivery", () => {
  let closeServer: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (closeServer) {
      await closeServer();
      closeServer = undefined;
    }
  });

  it("delivers post-user-registration webhook for users created on /u/login/email-otp-challenge", async () => {
    const webhookCalls: Array<{ trigger_id: string; user: unknown }> = [];

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

    const { universalApp, oauthApp, env, getSentEmails } = await getTestServer({
      mockEmail: true,
      outbox: true,
    });

    await env.data.hooks.create("tenantId", {
      url,
      trigger_id: "post-user-registration",
      enabled: true,
      synchronous: false,
    });

    const oauthClient = testClient(oauthApp, env);
    const universalClient = testClient(universalApp, env);

    const authorizeResponse = await oauthClient.authorize.$get({
      query: {
        client_id: "clientId",
        redirect_uri: "https://example.com/callback",
        state: "state",
        nonce: "nonce",
        scope: "openid email profile",
        response_type: AuthorizationResponseType.CODE,
        response_mode: AuthorizationResponseMode.QUERY,
      },
    });
    expect(authorizeResponse.status).toBe(302);

    const location = authorizeResponse.headers.get("location");
    if (!location) throw new Error("No location header from /authorize");
    const state = new URL(`https://example.com${location}`).searchParams.get(
      "state",
    );
    if (!state) throw new Error("No state in universal-login redirect");

    // Enter a fresh email that doesn't yet exist — the OTP verify step
    // will create the user and enqueue the post-user-registration hook.
    const newEmail = "new-registrant@example.com";

    const identifierPost = await universalClient.login.identifier.$post({
      query: { state },
      form: { username: newEmail },
    });
    expect(identifierPost.status).toBe(302);

    const codeGet = await universalClient.login["email-otp-challenge"].$get({
      query: { state },
    });
    expect(codeGet.status).toBe(200);

    const otpEmail = getSentEmails().find((e) => e.to === newEmail);
    if (!otpEmail?.data?.code) {
      throw new Error(
        `No OTP email sent to ${newEmail}; got ${JSON.stringify(getSentEmails().map((e) => e.to))}`,
      );
    }

    const codePost = await universalClient.login["email-otp-challenge"].$post({
      query: { state },
      form: { code: otpEmail.data.code },
    });
    expect(codePost.status).toBe(302);

    // Confirm a user was actually created on the universal-login path.
    const createdUser = await env.data.users.list("tenantId", {
      q: `email:${newEmail}`,
      page: 0,
      per_page: 10,
      include_totals: false,
    });
    expect(createdUser.users.length).toBeGreaterThan(0);

    const registrationCall = webhookCalls.find(
      (c) => c.trigger_id === "post-user-registration",
    );
    expect(registrationCall).toBeDefined();

    const failed = await env.data.outbox!.listFailed("tenantId");
    const deadLettered = failed.events.find(
      (e) => e.event_type === "hook.post-user-registration",
    );
    expect(deadLettered).toBeUndefined();
  });
});
