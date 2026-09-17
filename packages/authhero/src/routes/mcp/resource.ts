import type { Bindings } from "../../types";

export const MCP_PATH = "/mcp";

/**
 * Whether `value` is the resource URL of this deployment's MCP server on a
 * host it serves: the issuer host, the control-plane issuer host, a
 * `{tenant}.{issuer host}` subdomain of an existing tenant, or a registered
 * custom domain.
 *
 * `/authorize` accepts such a URL as the token audience (RFC 8707 `resource`)
 * without a registered resource server, and the MCP endpoint requires the
 * token's `aud` to be exactly its own resource URL. Tokens are therefore
 * bound to one MCP host and cannot be replayed from other clients or APIs.
 */
export async function isMcpResourceUrl(
  env: Bindings,
  value: string,
): Promise<boolean> {
  if (!env.mcp) return false;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  const issuer = new URL(env.ISSUER);
  // Plain http only when the deployment itself runs on http (local dev).
  const protocolAllowed =
    url.protocol === "https:" ||
    (url.protocol === "http:" && issuer.protocol === "http:");
  if (
    !protocolAllowed ||
    url.pathname !== MCP_PATH ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  ) {
    return false;
  }

  const host = url.host.toLowerCase();
  const issuerHost = issuer.host.toLowerCase();
  const controlPlaneHost = new URL(
    env.mcp.controlPlaneIssuer ?? env.ISSUER,
  ).host.toLowerCase();
  if (host === issuerHost || host === controlPlaneHost) return true;

  if (host.endsWith(`.${issuerHost}`)) {
    const label = host.slice(0, -(issuerHost.length + 1));
    if (!label || label.includes(".")) return false;
    return (await env.data.tenants.get(label)) !== null;
  }

  return (await env.data.customDomains.getByDomain(host)) !== null;
}
