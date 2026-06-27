import { describe, it, expect, beforeEach } from "vitest";
import { getTestServer } from "../helpers/test-server";

function device() {
  return {
    last_ip: "",
    initial_ip: "",
    last_user_agent: "",
    initial_user_agent: "",
    initial_asn: "",
    last_asn: "",
  };
}

describe("sessions adapter keeps parent login_session alive", () => {
  let data: ReturnType<typeof getTestServer>["data"];

  beforeEach(async () => {
    const server = getTestServer();
    data = server.data;

    await data.tenants.create({ id: "tenantId", name: "Test Tenant" });
  });

  async function createLoginSession(expiresAt: string) {
    return data.loginSessions.create("tenantId", {
      csrf_token: "csrf",
      authParams: { client_id: "clientId" },
      expires_at: expiresAt,
      state: "pending",
    });
  }

  it("extends login_session.expires_at to match the session's longest expiry on create", async () => {
    const shortExpiry = new Date(Date.now() + 1000 * 60 * 60).toISOString(); // 1h
    const absoluteExpiry = new Date(
      Date.now() + 1000 * 60 * 60 * 24 * 7,
    ).toISOString(); // 7d
    const idleExpiry = new Date(
      Date.now() + 1000 * 60 * 60 * 24 * 3,
    ).toISOString(); // 3d

    const loginSession = await createLoginSession(shortExpiry);

    await data.sessions.create("tenantId", {
      id: "session1",
      user_id: "email|userId",
      login_session_id: loginSession.id,
      expires_at: absoluteExpiry,
      idle_expires_at: idleExpiry,
      device: device(),
      clients: ["clientId"],
    });

    const after = await data.loginSessions.get("tenantId", loginSession.id);
    expect(after?.expires_at).toEqual(absoluteExpiry);
  });

  it("never shortens an already-longer login_session on create", async () => {
    const longExpiry = new Date(
      Date.now() + 1000 * 60 * 60 * 24 * 30,
    ).toISOString(); // 30d
    const shortExpiry = new Date(Date.now() + 1000 * 60 * 60).toISOString(); // 1h

    const loginSession = await createLoginSession(longExpiry);

    await data.sessions.create("tenantId", {
      id: "session1",
      user_id: "email|userId",
      login_session_id: loginSession.id,
      expires_at: shortExpiry,
      idle_expires_at: shortExpiry,
      device: device(),
      clients: ["clientId"],
    });

    const after = await data.loginSessions.get("tenantId", loginSession.id);
    expect(after?.expires_at).toEqual(longExpiry);
  });

  it("extends login_session.expires_at when a session is renewed (update)", async () => {
    const initialExpiry = new Date(Date.now() + 1000 * 60 * 60).toISOString(); // 1h
    const renewedExpiry = new Date(
      Date.now() + 1000 * 60 * 60 * 24 * 5,
    ).toISOString(); // 5d

    const loginSession = await createLoginSession(initialExpiry);

    await data.sessions.create("tenantId", {
      id: "session1",
      user_id: "email|userId",
      login_session_id: loginSession.id,
      expires_at: initialExpiry,
      idle_expires_at: initialExpiry,
      device: device(),
      clients: ["clientId"],
    });

    // Renew without passing login_session_id — adapter resolves it from the row.
    await data.sessions.update("tenantId", "session1", {
      idle_expires_at: renewedExpiry,
    });

    const after = await data.loginSessions.get("tenantId", loginSession.id);
    expect(after?.expires_at).toEqual(renewedExpiry);
  });

  it("never shortens an already-longer login_session when a session is renewed (update)", async () => {
    const renewedExpiry = new Date(
      Date.now() + 1000 * 60 * 60 * 24 * 5,
    ).toISOString(); // 5d
    const longExpiry = new Date(
      Date.now() + 1000 * 60 * 60 * 24 * 30,
    ).toISOString(); // 30d — already longer than the renewed session

    const loginSession = await createLoginSession(longExpiry);

    await data.sessions.create("tenantId", {
      id: "session1",
      user_id: "email|userId",
      login_session_id: loginSession.id,
      expires_at: renewedExpiry,
      idle_expires_at: renewedExpiry,
      device: device(),
      clients: ["clientId"],
    });

    // Renewing to a shorter idle expiry must not pull the parent back in time.
    await data.sessions.update("tenantId", "session1", {
      idle_expires_at: renewedExpiry,
    });

    const after = await data.loginSessions.get("tenantId", loginSession.id);
    expect(after?.expires_at).toEqual(longExpiry);
  });
});
