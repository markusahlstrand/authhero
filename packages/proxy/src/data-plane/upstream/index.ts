import { ProxyRoute } from "../../types";
import { dispatchHttp } from "./http";
import { dispatchRedirect } from "./redirect";

export async function dispatchUpstream(
  route: ProxyRoute,
  req: Request,
): Promise<Response> {
  switch (route.upstream_type) {
    case "redirect":
      return dispatchRedirect(route, req);
    case "http":
    case "authhero":
      return dispatchHttp(route, req);
    default: {
      const _exhaustive: never = route.upstream_type;
      throw new Error(`Unhandled upstream type: ${String(_exhaustive)}`);
    }
  }
}
