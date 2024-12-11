import { parseCookies, serializeCookie } from "oslo/cookie";
import { SILENT_AUTH_MAX_AGE, SILENT_COOKIE_NAME } from "../constants";

function getCookieName(tenant_id: string) {
  return `${tenant_id}-${SILENT_COOKIE_NAME}`;
}

export function getAuthCookie(
  tenant_id: string,
  cookieHeaders?: string,
): string | undefined {
  if (!cookieHeaders) {
    return undefined;
  }

  const cookies = parseCookies(cookieHeaders);
  return cookies.get(getCookieName(tenant_id));
}

export function clearAuthCookie(tenant_id: string) {
  const options = {
    path: "/",
    httpOnly: true,
    secure: true,
    maxAge: 0,
  };

  return serializeCookie(getCookieName(tenant_id), "", {
    ...options,
    sameSite: "none",
  });
}

export function serializeAuthCookie(tenant_id: string, value: string) {
  const options = {
    path: "/",
    httpOnly: true,
    secure: true,
    maxAge: SILENT_AUTH_MAX_AGE,
  };

  return serializeCookie(getCookieName(tenant_id), value, {
    ...options,
    sameSite: "none",
  });
}
