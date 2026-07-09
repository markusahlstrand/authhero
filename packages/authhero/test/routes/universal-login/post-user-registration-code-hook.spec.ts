import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import {
  AuthorizationResponseType,
  AuthorizationResponseMode,
  CodeExecutor,
} from "@authhero/adapter-interfaces";
import { getTestServer } from "../../helpers/test-server";

/**
 * End-to-end wiring test for `CodeHookDestination` (issue #950).
 *
 * A `post-user-registration` **code hook** must run when a user registers via
 * universal-login. Unlike the previous inline execution, it now runs from the
 * outbox `hook.post-user-registration` event via `CodeHookDestination`, so it
 * gets retries + dead-letter. This proves the destination is wired into the
 * universal-login outbox middleware and driven by the relay.
 */
describe("universal-login post-user-registration code hook delivery", () => {
  it("runs the post-user-registration code hook from the outbox on universal-login signup", async () => {
    const executorCalls: Array<{
      triggerId: string;
      event: Record<string, unknown>;
    }> = [];

    const codeExecutor: CodeExecutor = {
      async execute(params) {
        executorCalls.push({
          triggerId: params.triggerId,
          event: params.event,
        });
        return { success: true, durationMs: 1, apiCalls: [], logs: [] };
      },
    };

    const { universalApp, oauthApp, env, getSentEmails } = await getTestServer({
      mockEmail: true,
      outbox: true,
      codeExecutor,
    });

    // Provision an action holding code + a hook binding it to the trigger.
    const action = await env.data.actions.create("tenantId", {
      name: "post-reg-action",
      code: "exports.onExecutePostUserRegistration = async () => {};",
    });
    await env.data.hooks.create("tenantId", {
      trigger_id: "post-user-registration",
      enabled: true,
      code_id: action.id,
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

    const newEmail = "code-hook-registrant@example.com";

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
      throw new Error(`No OTP email sent to ${newEmail}`);
    }

    const codePost = await universalClient.login["email-otp-challenge"].$post({
      query: { state },
      form: { code: otpEmail.data.code },
    });
    expect(codePost.status).toBe(302);

    // The code hook ran via the outbox relay for the registration trigger.
    const regCall = executorCalls.find(
      (c) => c.triggerId === "post-user-registration",
    );
    expect(regCall).toBeDefined();
    // The outbox event id is surfaced for at-least-once dedupe.
    expect(typeof regCall!.event.idempotency_key).toBe("string");
    // The registered user's email is carried in the event payload.
    expect((regCall!.event.user as { email?: string })?.email).toBe(newEmail);

    // The event must not have been dead-lettered.
    const failed = await env.data.outbox!.listFailed("tenantId");
    expect(
      failed.events.find(
        (e) => e.event_type === "hook.post-user-registration",
      ),
    ).toBeUndefined();
  });
});
