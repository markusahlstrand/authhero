import { MiddlewareConfig } from "../../types";

type BasicAuthConfig = Extract<MiddlewareConfig, { type: "basic_auth" }>;

export function checkBasicAuth(
  config: BasicAuthConfig,
  req: Request,
): Response | null {
  const header = req.headers.get("authorization");
  const expected = encodeCredentials(config.username, config.password);

  if (header) {
    const spaceIdx = header.indexOf(" ");
    if (spaceIdx > 0) {
      const scheme = header.slice(0, spaceIdx);
      const creds = header.slice(spaceIdx + 1);
      if (scheme.toLowerCase() === "basic" && creds === expected) return null;
    }
  }

  const realm = (config.realm ?? "Restricted").replace(/["\\\r\n]/g, "");
  return new Response("Unauthorized", {
    status: 401,
    headers: {
      "WWW-Authenticate": `Basic realm="${realm}"`,
    },
  });
}

function encodeCredentials(username: string, password: string): string {
  const raw = `${username}:${password}`;
  if (typeof btoa === "function") return btoa(raw);
  return Buffer.from(raw, "utf-8").toString("base64");
}
