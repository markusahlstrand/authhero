import type { OpenAPIHono } from "@hono/zod-openapi";
import type { Bindings, Variables } from "../../src/types";

/**
 * Hits the u2 catch-all screen dispatcher (`GET|POST /:screen{.+}`) with a
 * typed screen path. The dispatcher rejects unknown screens via Zod, so the
 * `screen` argument should be one of the keys in `SCREEN_GET_PATHS` /
 * `SCREEN_POST_PATHS` over in `src/routes/universal-login/u2-routes.tsx`.
 *
 * Replaces the previous `testClient(u2App, env).<path>.$get(...)` style now
 * that u2Routes registers two dispatchers instead of one route per screen.
 * The returned shape mirrors testClient's `$get` / `$post` so call-site
 * migration is a one-line change.
 */
type U2App = OpenAPIHono<{ Bindings: Bindings; Variables: Variables }>;

type Init = {
  query?: Record<string, string>;
  header?: Record<string, string>;
};
type PostInit = Init & { form?: Record<string, string> };

function buildUrl(screen: string, query?: Record<string, string>) {
  const qs = query ? "?" + new URLSearchParams(query).toString() : "";
  return `http://localhost/${screen}${qs}`;
}

export function u2Screen(u2App: U2App, env: Bindings, screen: string) {
  return {
    $get: (init: Init = {}) =>
      u2App.request(
        buildUrl(screen, init.query),
        { method: "GET", headers: init.header },
        env,
      ),
    $post: (init: PostInit = {}) =>
      u2App.request(
        buildUrl(screen, init.query),
        {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            ...init.header,
          },
          body: init.form
            ? new URLSearchParams(init.form).toString()
            : undefined,
        },
        env,
      ),
  };
}
