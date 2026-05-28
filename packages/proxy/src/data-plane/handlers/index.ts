import { HandlerRegistry } from "../registry";
import { corsHandler } from "./cors";
import { basicAuthHandler } from "./basic-auth";
import { headersHandler } from "./headers";
import { cacheHandler } from "./cache";
import { forwardedHeadersHandler } from "./forwarded-headers";
import { rewriteCookiesHandler } from "./rewrite-cookies";
import { rewriteLocationHandler } from "./rewrite-location";
import { httpHandler } from "./http";
import { serviceBindingHandler } from "./service-binding";
import { redirectHandler } from "./redirect";
import { staticHandler } from "./static";

export function registerBuiltinHandlers(registry: HandlerRegistry): void {
  registry
    .add(corsHandler)
    .add(basicAuthHandler)
    .add(headersHandler)
    .add(cacheHandler)
    .add(forwardedHeadersHandler)
    .add(rewriteCookiesHandler)
    .add(rewriteLocationHandler)
    .add(httpHandler)
    .add(serviceBindingHandler)
    .add(redirectHandler)
    .add(staticHandler);
}

export { corsHandler } from "./cors";
export { basicAuthHandler } from "./basic-auth";
export { headersHandler } from "./headers";
export { cacheHandler } from "./cache";
export { forwardedHeadersHandler } from "./forwarded-headers";
export { rewriteCookiesHandler } from "./rewrite-cookies";
export { rewriteLocationHandler } from "./rewrite-location";
export { httpHandler } from "./http";
export { serviceBindingHandler } from "./service-binding";
export { redirectHandler } from "./redirect";
export { staticHandler } from "./static";
