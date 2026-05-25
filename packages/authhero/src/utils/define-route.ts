import {
  OpenAPIRoute,
  RouteConfig,
  defineOpenAPIRoute,
} from "@hono/zod-openapi";
import { Bindings, Variables } from "../types";

/**
 * Pin the handler context to the authhero app's `Bindings`/`Variables` so
 * `ctx.var.tenant_id`, `ctx.env.data`, etc. are typed at the call site.
 *
 * Without this wrapper, `defineOpenAPIRoute`'s `E` generic defaults to the
 * base `Env`, and every handler ends up with `ctx.var: object` and
 * `ctx.env: object | undefined`.
 *
 * Each route file imports `defineRoute` and registers its routes via
 * `new OpenAPIHono<{ Bindings; Variables }>().openapiRoutes([...] as const)`
 * — replacing the pre-1.x chained `.openapi(...)` style.
 */
type AuthHeroEnv = { Bindings: Bindings; Variables: Variables };

export const defineRoute = <
  R extends RouteConfig,
  const AddRoute extends boolean | undefined = undefined,
>(
  def: OpenAPIRoute<R, AuthHeroEnv, AddRoute>,
): OpenAPIRoute<R, AuthHeroEnv, AddRoute> =>
  defineOpenAPIRoute<R, AuthHeroEnv, AddRoute>(def);
