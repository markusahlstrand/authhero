import { DataAdapters } from "@authhero/adapter-interfaces";

export async function createSessions(data: DataAdapters) {
  // Create the login session and the session
  const loginSession = await data.loginSessions.create("tenantId", {
    expires_at: new Date(Date.now() + 1000).toISOString(),
    csrf_token: "csrfToken",
    authParams: {
      client_id: "clientId",
    },
  });

  const session = await data.sessions.create("tenantId", {
    id: "sessionId",
    login_session_id: loginSession.id,
    user_id: "email|userId",
    clients: ["clientId"],
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

  loginSession.session_id = session.id;
  await data.loginSessions.update("tenantId", loginSession.id, {
    session_id: session.id,
  });

  return {
    loginSession,
    session,
  };
}
