/**
 * Minimal shape of a Cloudflare service binding (a `Fetcher`). Declared
 * locally so `@authhero/proxy` does not depend on `@cloudflare/workers-types`.
 */
export interface ServiceBindingFetcher {
  fetch(request: Request): Promise<Response>;
}

/**
 * Wrap a Cloudflare service binding as a `fetch`-compatible function, suitable
 * for the `fetch` override on {@link HttpProxyAdapterOptions}.
 *
 * When the proxy's control plane lives on a hostname that the proxy itself
 * serves (e.g. the proxy owns `*.token.example.com/*` and the control plane
 * resolves at `https://controlplane.token.example.com`), resolving it over the
 * public edge loops the proxy's `resolveHost`/`/oauth/token` calls straight
 * back into itself — a self-DoS. Routing those calls through a service binding
 * to the control-plane worker keeps them off the public edge entirely, so the
 * loop cannot form regardless of the configured `baseUrl`.
 *
 * ```ts
 * const data = createHttpProxyAdapter({
 *   baseUrl: env.CONTROL_PLANE_URL,
 *   clientId: env.CONTROL_PLANE_CLIENT_ID,
 *   clientSecret: env.CONTROL_PLANE_CLIENT_SECRET,
 *   fetch: createServiceBindingFetch(env.AUTH2),
 * });
 * ```
 */
export function createServiceBindingFetch(
  fetcher: ServiceBindingFetcher,
): typeof fetch {
  const bindingFetch = (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    // Preserve an already-built Request untouched when there is no init to
    // merge; otherwise normalize to a Request the binding's fetcher accepts.
    const request =
      input instanceof Request && init === undefined
        ? input
        : new Request(input, init);
    return fetcher.fetch(request);
  };
  return bindingFetch as typeof fetch;
}
