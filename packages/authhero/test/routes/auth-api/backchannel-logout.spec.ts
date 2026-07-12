import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getTestServer } from "../../helpers/test-server";
import { createSessions } from "../../helpers/create-session";
import {
  getAdminToken,
  getCertificate,
  pemToBuffer,
} from "../../helpers/token";
import { signJWT, parseJWT } from "../../../src/utils/jwt";

const BACKCHANNEL_LOGOUT_EVENT =
  "http://schemas.openid.net/event/backchannel-logout";

async function signIdToken(sid: string) {
  const cert = await getCertificate();
  return signJWT(
    "RS256",
    pemToBuffer(cert.pkcs7!),
    {
      aud: "clientId",
      sub: "email|userId",
      iss: "http://localhost:3000/",
      sid,
    },
    {
      includeIssuedTimestamp: true,
      expiresInSeconds: 3600,
      headers: { kid: cert.kid },
    },
  );
}

describe("backchannel logout", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response("", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function deliveredLogoutToken(callIndex = 0) {
    const [url, init] = fetchMock.mock.calls[callIndex] ?? [];
    expect(init?.method).toBe("POST");
    expect(init?.headers?.["content-type"]).toBe(
      "application/x-www-form-urlencoded",
    );
    const logout_token = new URLSearchParams(String(init?.body)).get(
      "logout_token",
    );
    expect(logout_token).toBeTruthy();
    const parsed = parseJWT(logout_token!);
    expect(parsed).not.toBeNull();
    return { url: String(url), ...parsed! };
  }

  it("POSTs a signed logout token to the client's registered URL on /oidc/logout", async () => {
    const { oauthApp, env } = await getTestServer();
    const { session } = await createSessions(env.data);

    await env.data.clients.update("tenantId", "clientId", {
      oidc_logout: {
        backchannel_logout_urls: ["https://rp.example.com/backchannel"],
      },
    });

    const idToken = await signIdToken(session.id);
    const response = await oauthApp.request(
      `/oidc/logout?id_token_hint=${encodeURIComponent(idToken)}`,
      {
        method: "GET",
        headers: {
          host: "auth.example.com",
          cookie: `tenantId-auth-token=${session.id}`,
        },
      },
      env,
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const { url, header, payload } = deliveredLogoutToken();
    expect(url).toBe("https://rp.example.com/backchannel");

    expect(header.typ).toBe("logout+jwt");
    expect(header.alg).toBe("RS256");
    expect(header.kid).toBeTypeOf("string");

    expect(payload.iss).toBe("http://localhost:3000/");
    expect(payload.aud).toBe("clientId");
    expect(payload.sub).toBe("email|userId");
    expect(payload.sid).toBe(session.id);
    expect(payload.jti).toBeTypeOf("string");
    expect(payload.events).toEqual({ [BACKCHANNEL_LOGOUT_EVENT]: {} });
    // OIDC Back-Channel Logout 1.0 §2.4 — a logout token MUST NOT contain
    // a nonce, so it can never be replayed as an ID token.
    expect(payload).not.toHaveProperty("nonce");
    expect(payload.iat).toBeTypeOf("number");
    expect(payload.exp).toBeTypeOf("number");
  });

  it("revokes the session and notifies on /oidc/logout with sid but no cookie", async () => {
    const { oauthApp, env } = await getTestServer();
    const { session } = await createSessions(env.data);

    await env.data.clients.update("tenantId", "clientId", {
      oidc_logout: {
        backchannel_logout_urls: ["https://rp.example.com/backchannel"],
      },
    });

    const idToken = await signIdToken(session.id);
    const response = await oauthApp.request(
      `/oidc/logout?id_token_hint=${encodeURIComponent(idToken)}`,
      {
        method: "GET",
        headers: { host: "auth.example.com" },
      },
      env,
    );

    expect(response.status).toBe(200);

    const sessionAfter = await env.data.sessions.get("tenantId", session.id);
    expect(sessionAfter?.revoked_at).toBeTypeOf("string");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const { payload } = deliveredLogoutToken();
    expect(payload.sid).toBe(session.id);
  });

  it("does not call out when the client has no backchannel_logout_urls", async () => {
    const { oauthApp, env } = await getTestServer();
    const { session } = await createSessions(env.data);

    const idToken = await signIdToken(session.id);
    const response = await oauthApp.request(
      `/oidc/logout?id_token_hint=${encodeURIComponent(idToken)}`,
      {
        method: "GET",
        headers: {
          host: "auth.example.com",
          cookie: `tenantId-auth-token=${session.id}`,
        },
      },
      env,
    );

    expect(response.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("notifies on /v2/logout", async () => {
    const { oauthApp, env } = await getTestServer();
    const { session } = await createSessions(env.data);

    await env.data.clients.update("tenantId", "clientId", {
      oidc_logout: {
        backchannel_logout_urls: ["https://rp.example.com/backchannel"],
      },
    });

    const response = await oauthApp.request(
      `/v2/logout?client_id=clientId&returnTo=${encodeURIComponent("https://example.com/callback")}`,
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
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const { payload } = deliveredLogoutToken();
    expect(payload.sid).toBe(session.id);
  });

  it("notifies when a session is revoked via the management API", async () => {
    const { managementApp, env } = await getTestServer();
    const { session } = await createSessions(env.data);

    await env.data.clients.update("tenantId", "clientId", {
      oidc_logout: {
        backchannel_logout_urls: ["https://rp.example.com/backchannel"],
      },
    });

    const token = await getAdminToken();
    const response = await managementApp.request(
      `/sessions/${session.id}/revoke`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "tenant-id": "tenantId",
        },
      },
      env,
    );

    expect(response.status).toBe(202);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const { payload } = deliveredLogoutToken();
    expect(payload.sid).toBe(session.id);
    expect(payload.aud).toBe("clientId");
  });

  it("notifies when a session is deleted via the management API", async () => {
    const { managementApp, env } = await getTestServer();
    const { session } = await createSessions(env.data);

    await env.data.clients.update("tenantId", "clientId", {
      oidc_logout: {
        backchannel_logout_urls: ["https://rp.example.com/backchannel"],
      },
    });

    const token = await getAdminToken();
    const response = await managementApp.request(
      `/sessions/${session.id}`,
      {
        method: "DELETE",
        headers: {
          authorization: `Bearer ${token}`,
          "tenant-id": "tenantId",
        },
      },
      env,
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const { payload } = deliveredLogoutToken();
    expect(payload.sid).toBe(session.id);
  });

  it("sends one token per participating client, addressed to that client", async () => {
    const { oauthApp, env } = await getTestServer();
    const { loginSession } = await createSessions(env.data);

    await env.data.clients.update("tenantId", "clientId", {
      oidc_logout: {
        backchannel_logout_urls: ["https://rp.example.com/backchannel"],
      },
    });
    await env.data.clients.create("tenantId", {
      client_id: "otherClientId",
      name: "Other client",
      oidc_logout: {
        backchannel_logout_urls: ["https://other-rp.example.com/backchannel"],
      },
    });

    const session = await env.data.sessions.create("tenantId", {
      id: "multiClientSession",
      login_session_id: loginSession.id,
      user_id: "email|userId",
      clients: ["clientId", "otherClientId"],
      expires_at: new Date(Date.now() + 1000).toISOString(),
      used_at: new Date().toISOString(),
      device: {
        last_ip: "",
        initial_ip: "",
        last_user_agent: "",
        initial_user_agent: "",
        initial_asn: "",
        last_asn: "",
      },
    });

    const idToken = await signIdToken(session.id);
    const response = await oauthApp.request(
      `/oidc/logout?id_token_hint=${encodeURIComponent(idToken)}`,
      {
        method: "GET",
        headers: {
          host: "auth.example.com",
          cookie: `tenantId-auth-token=${session.id}`,
        },
      },
      env,
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const deliveries = [deliveredLogoutToken(0), deliveredLogoutToken(1)];
    const byAud = new Map(deliveries.map((d) => [d.payload.aud, d.url]));
    expect(byAud.get("clientId")).toBe("https://rp.example.com/backchannel");
    expect(byAud.get("otherClientId")).toBe(
      "https://other-rp.example.com/backchannel",
    );
  });

  async function logoutWithPrivateTarget(allowPrivate: boolean) {
    const { oauthApp, env } = await getTestServer();
    if (allowPrivate) {
      // Local-dev override, used by the conformance setup whose suite lives
      // on localhost.emobix.co.uk.
      env.ALLOW_PRIVATE_OUTBOUND_FETCH = true;
    }
    const { session } = await createSessions(env.data);

    await env.data.clients.update("tenantId", "clientId", {
      oidc_logout: {
        backchannel_logout_urls: ["https://localhost:8443/backchannel"],
      },
    });

    const idToken = await signIdToken(session.id);
    const response = await oauthApp.request(
      `/oidc/logout?id_token_hint=${encodeURIComponent(idToken)}`,
      {
        method: "GET",
        headers: {
          host: "auth.example.com",
          cookie: `tenantId-auth-token=${session.id}`,
        },
      },
      env,
    );
    expect(response.status).toBe(200);
  }

  it("refuses to deliver to private targets by default", async () => {
    await logoutWithPrivateTarget(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("delivers to private targets when ALLOW_PRIVATE_OUTBOUND_FETCH is set", async () => {
    await logoutWithPrivateTarget(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
