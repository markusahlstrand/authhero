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
    const verifiedHtml = await verifyResponse.text();
    expect(verifiedHtml).toContain("Email verified");
    // The continue button leads back to the app the user signed up from
    expect(verifiedHtml).toContain('href="https://example.com"');

    const { users: afterUsers } = await env.data.users.list("tenantId", {
      q: "email:newuser@example.com",
      page: 0,
      per_page: 10,
      include_totals: false,
    });
    expect(afterUsers[0].email_verified).toBe(true);

    // The ticket is single-use, but a second click (or the user's first
    // after a mail scanner prefetched the link) still lands on the verified
    // page rather than an error.
    const replayResponse = await app.request(link, { method: "GET" }, env);
    expect(replayResponse.status).toBe(200);
    expect(await replayResponse.text()).toContain("Email verified");
  });

  it("prefers the client's initiate_login_uri and the ticket's language", async () => {
    const { app, env } = await getTestServer({ mockEmail: true });
    await env.data.clients.update("tenantId", "clientId", {
      initiate_login_uri: "https://app.example.com/login",
    });
    await env.data.users.create("tenantId", {
      user_id: "auth2|verify-me",
      email: "verify-me@example.com",
      email_verified: false,
      provider: "auth2",
      connection: "Username-Password-Authentication",
      is_social: false,
    });
    await env.data.codes.create("tenantId", {
      code_id: "verify-ticket",
      code_type: "ticket",
      login_id: "verify-ticket",
      user_id: "auth2|verify-me",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      state: JSON.stringify({
        purpose: "email_verification",
        client_id: "clientId",
        redirect_uri: "https://example.com/callback",
        language: "sv",
      }),
    });

    const response = await app.request(
      "http://localhost/u2/tickets/email-verification?ticket=verify-ticket&tenant_id=tenantId",
      { method: "GET" },
      env,
    );

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("E-post verifierad");
    expect(html).toContain('href="https://app.example.com/login"');
    expect(html).toContain("Fortsätt");
  });

  async function renderVerifiedWithInitiateLoginUri(initiateLoginUri: string) {
    const { app, env } = await getTestServer({ mockEmail: true });
    await env.data.clients.update("tenantId", "clientId", {
      initiate_login_uri: initiateLoginUri,
    });
    await env.data.users.create("tenantId", {
      user_id: "auth2|verify-me",
      email: "verify-me@example.com",
      email_verified: false,
      provider: "auth2",
      connection: "Username-Password-Authentication",
      is_social: false,
    });
    await env.data.codes.create("tenantId", {
      code_id: "verify-ticket",
      code_type: "ticket",
      login_id: "verify-ticket",
      user_id: "auth2|verify-me",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      state: JSON.stringify({
        purpose: "email_verification",
        client_id: "clientId",
        redirect_uri: "https://example.com/callback",
      }),
    });
    const response = await app.request(
      "http://localhost/u2/tickets/email-verification?ticket=verify-ticket&tenant_id=tenantId",
      { method: "GET" },
      env,
    );
    expect(response.status).toBe(200);
    return response.text();
  }

  it("escapes the Continue URL's query string only once", async () => {
    const html = await renderVerifiedWithInitiateLoginUri(
      "https://app.example.com/login?a=1&b=2",
    );
    expect(html).toContain('href="https://app.example.com/login?a=1&amp;b=2"');
  });

  it("ignores a non-HTTPS initiate_login_uri and falls back to the redirect_uri origin", async () => {
    const html = await renderVerifiedWithInitiateLoginUri(
      "data:text/html,<h1>hi</h1>",
    );
    expect(html).not.toContain("data:text/html");
    expect(html).toContain('href="https://example.com"');
  });

  it("localizes the failure page from Accept-Language for an unknown ticket", async () => {
    const { app, env } = await getTestServer({ mockEmail: true });

    const response = await app.request(
      "http://localhost/u2/tickets/email-verification?ticket=nope&tenant_id=tenantId",
      { method: "GET", headers: { "Accept-Language": "sv" } },
      env,
    );

    expect(response.status).toBe(400);
    const html = await response.text();
    expect(html).toContain('lang="sv"');
    expect(html).toContain("Verifieringslänken är ogiltig eller har gått ut");
  });

  it("renders a branded error page for an unknown ticket", async () => {
    const { app, env } = await getTestServer({ mockEmail: true });

    const response = await app.request(
      "http://localhost/u2/tickets/email-verification?ticket=nope&tenant_id=tenantId",
      { method: "GET" },
      env,
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(await response.text()).toContain("invalid or has expired");
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
