/**
 * Scope a control-plane bearer token must carry to call
 * `GET /api/v2/proxy/control-plane/hosts/:host` or `POST /sync`. The data
 * plane requests it when minting tokens; the control plane requires it when
 * verifying them.
 */
export const PROXY_RESOLVE_HOST_SCOPE = "proxy:resolve_host";
