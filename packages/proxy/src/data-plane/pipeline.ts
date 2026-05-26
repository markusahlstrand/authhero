import { MiddlewareConfig, ProxyRoute } from "../types";
import { applyCorsRequest, applyCorsResponse } from "./middleware/cors";
import {
  applyHeadersRequest,
  applyHeadersResponse,
} from "./middleware/headers";
import { checkBasicAuth } from "./middleware/basic-auth";
import { applyCacheHeaders } from "./middleware/cache";
import { dispatchUpstream } from "./upstream";

export async function runRoute(
  route: ProxyRoute,
  initialReq: Request,
): Promise<Response> {
  const corsConfig = route.middleware.find(
    (m): m is Extract<MiddlewareConfig, { type: "cors" }> => m.type === "cors",
  );
  if (corsConfig) {
    const preflight = applyCorsRequest(corsConfig, initialReq);
    if (preflight) return preflight;
  }

  let req = initialReq;
  for (const mw of route.middleware) {
    if (mw.type === "basic_auth") {
      const unauthorized = checkBasicAuth(mw, req);
      if (unauthorized) return unauthorized;
    } else if (mw.type === "headers") {
      req = applyHeadersRequest(mw, req);
    }
  }

  let res = await dispatchUpstream(route, req);

  for (const mw of route.middleware) {
    if (mw.type === "headers") {
      res = applyHeadersResponse(mw, res);
    } else if (mw.type === "cache") {
      res = applyCacheHeaders(mw, res);
    }
  }
  if (corsConfig) {
    res = applyCorsResponse(corsConfig, initialReq, res);
  }

  return res;
}
