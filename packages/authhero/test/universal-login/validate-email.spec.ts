import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { AuthorizationResponseType } from "@authhero/adapter-interfaces";
import { getTestServer } from "../helpers/test-server";
import { u2Screen } from "../helpers/u2-screen";

type TestServer = Awaited<ReturnType<typeof getTestServer>>;

async function startLoginSession(
  oauthApp: TestServer["oauthApp"],
  env: TestServer["env"],
): Promise<string> {
  const oauthClient = testClient(oauthApp, env);
  const authorizeResponse = await oauthClient.authorize.$get({
    query: {
      client_id: "clientId",
      redirect_uri: "https://example.com/callback",
      state: "state",
      nonce: "nonce",
      scope: "openid email profile",
      response_type: AuthorizationResponseType.CODE,
    },
  });
  expect(authorizeResponse.status).toBe(302);
  const location = authorizeResponse.headers.get("location");
  const state = new URL(`https://example.com${location}`).searchParams.get(
    "state",
  );
  if (!state) {
    throw new Error("No state found");
  }
  return state;
}

describe("email verification after signup", () => {
  it("sends a working u2 ticket link that marks the email as verified", async () => {
    const { app, u2App, oauthApp, env, getSentEmails } = await getTestServer({
      mockEmail: true,
    });

    const state = await startLoginSession(oauthApp, env);

    // Sign up with email/password through the u2 signup screen
    const signupResponse = await u2Screen(u2App, env, "signup").$post({
      query: { state },
      form: {
        email: "newuser@example.com",
        password: "Password123!",
        re_password: "Password123!",
      },
    });
    expect(signupResponse.status).toBe(302);

    // A verification email must have been sent with a link the user can
    // actually follow: the u2 ticket endpoint, not the legacy
    // /u/validate-email page (which requires state+code query params the
    // email never carried).
    const verificationEmail = getSentEmails().find(
      (email) => email.template === "auth-verify-email",
    );
    expect(verificationEmail).toBeDefined();
    expect(verificationEmail.to).toBe("newuser@example.com");

    const link = verificationEmail.data.emailValidationUrl;
    const url = new URL(link);
    expect(url.pathname).toBe("/u2/tickets/email-verification");
    expect(url.searchParams.get("ticket")).toBeTruthy();
    expect(url.searchParams.get("tenant_id")).toBe("tenantId");

    // The user starts out unverified
    const { users: beforeUsers } = await env.data.users.list("tenantId", {
      q: "email:newuser@example.com",
      page: 0,
      per_page: 10,
      include_totals: false,
    });
    expect(beforeUsers).toHaveLength(1);
    expect(beforeUsers[0].email_verified).toBe(false);

    // Following the link verifies the email
    const verifyResponse = await app.request(link, { method: "GET" }, env);
    expect(verifyResponse.status).toBe(200);
    expect(await verifyResponse.text()).toContain("Email verified");

    const { users: afterUsers } = await env.data.users.list("tenantId", {
      q: "email:newuser@example.com",
      page: 0,
      per_page: 10,
      include_totals: false,
    });
    expect(afterUsers[0].email_verified).toBe(true);

    // The ticket is single-use
    const replayResponse = await app.request(link, { method: "GET" }, env);
    expect(replayResponse.status).toBe(400);
  });

  it("renders a branded error page instead of raw Zod JSON when /u/validate-email is missing params", async () => {
    const { universalApp, env } = await getTestServer({ mockEmail: true });

    const response = await universalApp.request(
      "http://localhost/validate-email",
      { method: "GET" },
      env,
    );

    expect(response.status).toBe(400);
    const body = await response.text();
    expect(body).not.toContain("ZodError");
    expect(response.headers.get("content-type")).toContain("text/html");
  });
});
