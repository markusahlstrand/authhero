import { Context } from "hono";
import { LoginSession } from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../types";

export const TRY_CONNECTION_STATE_KEY = "try_connection_result";

export interface TryConnectionSuccess {
  status: "success";
  connection_id: string;
  connection_name: string;
  strategy: string;
  userinfo: Record<string, unknown>;
  raw: Record<string, unknown> | null;
  completed_at: string;
}

export interface TryConnectionError {
  status: "error";
  connection_id?: string;
  connection_name?: string;
  strategy?: string;
  error: string;
  error_description?: string;
  completed_at: string;
}

export type TryConnectionResult = TryConnectionSuccess | TryConnectionError;

interface StateData {
  [TRY_CONNECTION_STATE_KEY]?: TryConnectionResult;
  [key: string]: unknown;
}

function parseStateData(raw?: string): StateData {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as StateData)
      : {};
  } catch {
    return {};
  }
}

/**
 * Persist a try-connection outcome onto the originating login session's
 * `state_data` and 302 to the redirect_uri the test client requested,
 * preserving the original state so the result screen can locate the row.
 */
export async function writeTryConnectionResult(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  tenantId: string,
  loginSession: LoginSession,
  result: TryConnectionResult,
): Promise<Response> {
  const merged = {
    ...parseStateData(loginSession.state_data),
    [TRY_CONNECTION_STATE_KEY]: result,
  };
  await ctx.env.data.loginSessions.update(tenantId, loginSession.id, {
    state_data: JSON.stringify(merged),
  });

  const redirectUri = loginSession.authParams.redirect_uri;
  if (!redirectUri) {
    return new Response(JSON.stringify(result, null, 2), {
      status: result.status === "success" ? 200 : 400,
      headers: { "content-type": "application/json" },
    });
  }

  const url = new URL(redirectUri);
  url.searchParams.set("state", loginSession.id);
  return new Response(null, {
    status: 302,
    headers: { location: url.href },
  });
}

export function readTryConnectionResult(
  loginSession: LoginSession,
): TryConnectionResult | null {
  const data = parseStateData(loginSession.state_data);
  return data[TRY_CONNECTION_STATE_KEY] ?? null;
}
