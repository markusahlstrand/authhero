import { describe, it, expect } from "vitest";
import { createJWT } from "oslo/jwt";
import { TimeSpan } from "oslo";
import { LogTypes } from "@authhero/adapter-interfaces";
import { getTestServer } from "../../helpers/test-server";
import { createSessions } from "../../helpers/create-session";
import { getCertificate, pemToBuffer } from "../../helpers/token";

interface IdTokenOptions {
  aud?: string;
  sub?: string;
  iss?: string;
  sid?: string;
}

async function signIdToken(opts: IdTokenOptions = {}) {
  const cert = await getCertificate();
  return createJWT(
    "RS256",
    pemToBuffer(cert.pkcs7!),
    {
      aud: opts.aud ?? "clientId",
      sub: opts.sub ?? "email|userId",
      iss: opts.iss ?? "http://localhost:3000/",
      sid: opts.sid,
    },
    {
      includeIssuedTimestamp: true,
      expiresIn: new TimeSpan(1, "h"),
      headers: { kid: cert.kid },
    },
  );
}

describe("/oidc/logout", () => {
  it("redirects to a registered post_logout_redirect_uri with state echoed back", async () => {
    const { oauthApp, env } = await getTestServer();
    const idToken = await signIdToken();

    const url =
      `/oidc/logout?id_token_hint=${encodeURIComponent(idToken)}` +
      `&post_logout_redirect_uri=${encodeURIComponent("https://example.com/callback")}` +
      `&state=xyz`;
    const response = await oauthApp.request(
      url,
      { method: "GET", headers: { host: "auth.example.com" } },
      env,
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://example.com/callback?state=xyz",
    );

    const cookies = response.headers.get("set-cookie");
    expect(cookies).toContain("tenantId-auth-token=; Max-Age=0");
  });

  it("rejects an unregistered post_logout_redirect_uri", async () => {
    const { oauthApp, env } = await getTestServer();
    const idToken = await signIdToken();

    const url =
      `/oidc/logout?id_token_hint=${encodeURIComponent(idToken)}` +
      `&post_logout_redirect_uri=${encodeURIComponent("https://attacker.example/cb")}` +
      `&state=xyz`;
    const response = await oauthApp.request(url, { method: "GET" }, env);

    expect(response.status).toBe(400);
  });

  it("rejects an id_token_hint with an invalid signature", async () => {
    const { oauthApp, env } = await getTestServer();
    const idToken = await signIdToken();
    // Tamper with the signature segment.
    const parts = idToken.split(".");
    parts[2] = "AAAA" + (parts[2] ?? "").slice(4);
    const tampered = parts.join(".");

    const url = `/oidc/logout?id_token_hint=${encodeURIComponent(tampered)}`;
    const response = await oauthApp.request(url, { method: "GET" }, env);

    expect(response.status).toBe(400);
  });

  it("rejects a malformed id_token_hint", async () => {
    const { oauthApp, env } = await getTestServer();

    const url = `/oidc/logout?id_token_hint=not-a-jwt`;
    const response = await oauthApp.request(url, { method: "GET" }, env);

    expect(response.status).toBe(400);
  });

  it("rejects when client_id query param does not match id_token_hint aud", async () => {
    const { oauthApp, env } = await getTestServer();
    const idToken = await signIdToken({ aud: "clientId" });

    const url =
      `/oidc/logout?id_token_hint=${encodeURIComponent(idToken)}` +
      `&client_id=different-client`;
    const response = await oauthApp.request(url, { method: "GET" }, env);

    expect(response.status).toBe(400);
  });

  it("accepts client_id without id_token_hint", async () => {
    const { oauthApp, env } = await getTestServer();

    const url =
      `/oidc/logout?client_id=clientId` +
      `&post_logout_redirect_uri=${encodeURIComponent("https://example.com/callback")}`;
    const response = await oauthApp.request(
      url,
      { method: "GET", headers: { host: "auth.example.com" } },
      env,
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://example.com/callback",
    );
  });

  it("renders the logged-out page when no parameters are supplied", async () => {
    const { oauthApp, env } = await getTestServer();

    const response = await oauthApp.request(
      "/oidc/logout",
      { method: "GET" },
      env,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/text\/html/);
    const body = await response.text();
    expect(body).toContain("signed out");
  });

  it("renders the logged-out page when only id_token_hint is supplied", async () => {
    const { oauthApp, env } = await getTestServer();
    const idToken = await signIdToken();

    const url = `/oidc/logout?id_token_hint=${encodeURIComponent(idToken)}`;
    const response = await oauthApp.request(url, { method: "GET" }, env);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/text\/html/);
  });

  it("redirects without a state parameter when state is omitted", async () => {
    const { oauthApp, env } = await getTestServer();
    const idToken = await signIdToken();

    const url =
      `/oidc/logout?id_token_hint=${encodeURIComponent(idToken)}` +
      `&post_logout_redirect_uri=${encodeURIComponent("https://example.com/callback")}`;
    const response = await oauthApp.request(
      url,
      { method: "GET", headers: { host: "auth.example.com" } },
      env,
    );

    expect(response.status).toBe(302);
    const location = response.headers.get("location") ?? "";
    expect(new URL(location).searchParams.has("state")).toBe(false);
  });

  it("rejects post_logout_redirect_uri with extra query string not present in the registration (Simple String Comparison)", async () => {
    const { oauthApp, env } = await getTestServer();
    const idToken = await signIdToken();

    // Registered URL is "https://example.com/callback" — adding ?foo=bar
    // makes it a different URI under RFC 3986 §6.2.1 simple string match,
    // and the OP MUST NOT redirect (OIDC RP-Initiated Logout 1.0 §2).
    const target = "https://example.com/callback?foo=bar";
    const url =
      `/oidc/logout?id_token_hint=${encodeURIComponent(idToken)}` +
      `&post_logout_redirect_uri=${encodeURIComponent(target)}`;
    const response = await oauthApp.request(url, { method: "GET" }, env);

    expect(response.status).toBe(400);
  });

  it("redirects to a registered post_logout_redirect_uri that already includes a query string", async () => {
    const { oauthApp, env } = await getTestServer();

    // Pre-register a redirect URI that itself carries a query string. The
    // RP must request that exact URI (including the query) to be redirected.
    await env.data.clients.update("tenantId", "clientId", {
      allowed_logout_urls: [
        "https://example.com/callback",
        "https://example.com/callback?registered=1",
      ],
    });

    const idToken = await signIdToken();
    const target = "https://example.com/callback?registered=1";
    const url =
      `/oidc/logout?id_token_hint=${encodeURIComponent(idToken)}` +
      `&post_logout_redirect_uri=${encodeURIComponent(target)}` +
      `&state=abc`;
    const response = await oauthApp.request(
      url,
      { method: "GET", headers: { host: "auth.example.com" } },
      env,
    );

    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.searchParams.get("registered")).toBe("1");
    expect(location.searchParams.get("state")).toBe("abc");
  });

  it("rejects post_logout_redirect_uri without id_token_hint or client_id", async () => {
    const { oauthApp, env } = await getTestServer();

    const url = `/oidc/logout?post_logout_redirect_uri=${encodeURIComponent("https://example.com/callback")}`;
    const response = await oauthApp.request(url, { method: "GET" }, env);

    expect(response.status).toBe(400);
  });

  it("revokes the session and refresh tokens, and writes audit logs", async () => {
    const { oauthApp, env } = await getTestServer();
    const { loginSession, session } = await createSessions(env.data);

    await env.data.refreshTokens.create("tenantId", {
      id: "refreshToken",
      login_id: loginSession.id,
      user_id: "email|userId",
      client_id: "clientId",
      resource_servers: [
        { audience: "https://example.com", scopes: "openid" },
      ],
      device: {
        last_ip: "",
        initial_ip: "",
        last_user_agent: "",
        initial_user_agent: "",
        initial_asn: "",
        last_asn: "",
      },
      rotating: false,
    });

    const idToken = await signIdToken({ sid: session.id });
    const url =
      `/oidc/logout?id_token_hint=${encodeURIComponent(idToken)}` +
      `&post_logout_redirect_uri=${encodeURIComponent("https://example.com/callback")}`;

    const response = await oauthApp.request(
      url,
      {
        method: "GET",
        headers: {
          host: "auth.example.com",
          cookie: `tenantId-auth-token=${session.id}`,
        },
      },
      env,
    );

    expect(response.status).toBe(302);

    const sessionAfter = await env.data.sessions.get("tenantId", session.id);
    expect(sessionAfter?.revoked_at).toBeTypeOf("string");

    const { refresh_tokens } = await env.data.refreshTokens.list("tenantId", {
      q: `login_id:${loginSession.id}`,
      include_totals: false,
      per_page: 1,
      page: 0,
    });
    expect(refresh_tokens).toHaveLength(1);
    expect(refresh_tokens[0]?.revoked_at).toBeTypeOf("string");

    const { logs } = await env.data.logs.list("tenantId");
    const logTypes = logs.map((l) => l.type).sort();
    expect(logTypes).toEqual(
      [LogTypes.SUCCESS_LOGOUT, LogTypes.SUCCESS_REVOCATION].sort(),
    );
  });
});
