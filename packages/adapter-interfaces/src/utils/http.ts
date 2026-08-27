/**
 * Response header stamped by the authhero control plane on its deliberate
 * cross-host 302s — the `/authorize/resume` hop that sends the browser back
 * to the host that served the original `/authorize` request so the session
 * cookie lands on the right domain.
 *
 * Location-rewriting proxies (e.g. `@authhero/proxy`'s `rewrite_location`
 * handler) must leave a marked Location untouched — rewriting it back onto
 * the request host turns the hop into an infinite redirect loop — and strip
 * the marker before the response reaches the browser.
 */
export const PRESERVE_LOCATION_HEADER = "x-authhero-preserve-location";
