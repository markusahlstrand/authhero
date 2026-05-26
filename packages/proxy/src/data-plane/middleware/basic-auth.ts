import { MiddlewareConfig } from "../../types";

type BasicAuthConfig = Extract<MiddlewareConfig, { type: "basic_auth" }>;

export function checkBasicAuth(
  config: BasicAuthConfig,
  req: Request,
): Response | null {
  const header = req.headers.get("authorization");
  const expected = encodeCredentials(config.username, config.password);

  if (header === `Basic ${expected}`) return null;

  const realm = config.realm ?? "Restricted";
  return new Response("Unauthorized", {
    status: 401,
    headers: {
      "WWW-Authenticate": `Basic realm="${realm.replace(/"/g, "")}"`,
    },
  });
}

function encodeCredentials(username: string, password: string): string {
  const raw = `${username}:${password}`;
  if (typeof btoa === "function") return btoa(raw);
  return Buffer.from(raw, "utf-8").toString("base64");
}
