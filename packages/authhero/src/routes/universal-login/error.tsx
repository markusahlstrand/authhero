import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import type { Branding, Theme } from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../../types";
import { ErrorPage } from "./error-page";
import { extractBrandingProps } from "./u2-widget-page";
import { DEFAULT_THEME } from "../../constants/defaultTheme";

function mapErrorToMessage(error?: string, errorDescription?: string): string {
  if (errorDescription) {
    return errorDescription;
  }

  switch (error) {
    case "state_not_found":
      return "Your login session has expired or is invalid. Please go back to the application and try signing in again.";
    case "session_not_found":
      return "Your login session has expired. Please return to the application and try again.";
    default:
      return "An unexpected error occurred. Please try again later.";
  }
}

export const errorRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>().openapi(
  createRoute({
    tags: ["universal-login"],
    method: "get",
    path: "/",
    request: {
      query: z.object({
        error: z.string().optional(),
        error_description: z.string().optional(),
      }),
    },
    responses: {
      200: {
        description: "Error page",
      },
    },
  }),
  async (ctx) => {
    const { error, error_description } = ctx.req.valid("query");

    const tenantId = ctx.var.tenant_id;
    let branding: Branding | null = null;
    let theme: Theme | null = null;

    try {
      if (tenantId && ctx.env.data) {
        [theme, branding] = await Promise.all([
          ctx.env.data.themes.get(tenantId, "default"),
          ctx.env.data.branding.get(tenantId),
        ]);
      }
    } catch {
      // Fall back to default styling
    }

    const resolvedTheme = theme ?? DEFAULT_THEME;
    const brandingWithFavicon = branding
      ? {
          ...branding,
          favicon_url: ctx.var?.custom_domain
            ? branding.favicon_url
            : undefined,
        }
      : null;

    const message = mapErrorToMessage(error, error_description);

    return ctx.html(
      <ErrorPage
        message={message}
        statusCode={400}
        branding={extractBrandingProps(brandingWithFavicon)}
        theme={resolvedTheme}
      />,
      400,
    );
  },
);
