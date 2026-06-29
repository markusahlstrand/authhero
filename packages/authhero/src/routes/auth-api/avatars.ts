import { OpenAPIHono } from "@hono/zod-openapi";
import { Bindings, Variables } from "../../types";
import { renderAvatarSvg } from "../../helpers/avatar";

// Serves the generated fallback avatars referenced by `getDefaultUserPicture`.
// Public and unauthenticated: the URL carries only non-PII derived data
// (initials + a palette color), and the response is a static, cacheable SVG.
export const avatarRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>().get("/:initials", (ctx) => {
  const initials = ctx.req.param("initials").replace(/\.svg$/i, "");
  const bg = ctx.req.query("bg") ?? "";

  return ctx.body(renderAvatarSvg(initials, bg), 200, {
    "content-type": "image/svg+xml; charset=utf-8",
    "cache-control": "public, max-age=86400, immutable",
  });
});
