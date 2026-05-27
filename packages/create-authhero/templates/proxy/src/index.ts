import { AsyncLocalStorage } from "node:async_hooks";
import {
  createProxyApp,
  createStaticProxyAdapter,
} from "@authhero/proxy";
import { proxyConfig } from "./proxy.config";

// AsyncLocalStorage threads each request's ExecutionContext through to the
// host cache so background SWR refreshes keep running after the response
// returns. Requires the `nodejs_compat` compatibility flag.
interface RequestCtx {
  waitUntil: (promise: Promise<unknown>) => void;
}
const requestCtx = new AsyncLocalStorage<RequestCtx>();

const data = createStaticProxyAdapter(proxyConfig);

const app = createProxyApp({
  data,
  cache: {
    // Serve cached values directly for 5 minutes.
    freshTtlMs: 5 * 60_000,
    // For the next hour, keep serving the cached value and refresh in the
    // background. After that, the next request blocks on a fresh fetch.
    staleTtlMs: 60 * 60_000,
    // Don't cache "host not found" for as long — new hosts should become
    // reachable quickly after being added to the config.
    negativeTtlMs: 30_000,
    waitUntil: (promise) => requestCtx.getStore()?.waitUntil(promise),
  },
});

export default {
  fetch(request: Request, _env: unknown, ctx: ExecutionContext) {
    return requestCtx.run(
      { waitUntil: ctx.waitUntil.bind(ctx) },
      () => app.fetch(request),
    );
  },
};
