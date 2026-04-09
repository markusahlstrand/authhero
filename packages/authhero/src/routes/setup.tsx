import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Bindings, Variables, AuthHeroConfig } from "../types";
import { seed } from "../seed";
import { getConnectionFromIdentifier } from "../utils/username";
import { WidgetPage, renderWidgetSSR } from "./universal-login/u2-widget-page";

export default function createSetupApp(config: AuthHeroConfig) {
  const hasAdminUi = !!(config.adminHandler || config.adminIndexHtml);
  const isMultiTenant =
    config.managementApiExtensions?.some((e) => e.path === "/tenants") ?? false;

  const setupApp = new OpenAPIHono<{
    Bindings: Bindings;
    Variables: Variables;
  }>();

  function slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 64);
  }

  function getSetupScreen(error?: string) {
    return {
      action: "/setup",
      method: "POST",
      title: "Welcome to AuthHero",
      description: "Let's set up your authentication server.",
      components: [
        {
          id: "identifier",
          category: "FIELD",
          type: "EMAIL",
          order: 0,
          label: "Admin username or email",
          required: true,
          config: {
            placeholder: "admin@example.com",
          },
        },
        {
          id: "password",
          category: "FIELD",
          type: "PASSWORD",
          order: 1,
          label: "Admin password",
          required: true,
          config: {
            min_length: 8,
          },
        },
        {
          id: "confirm_password",
          category: "FIELD",
          type: "PASSWORD",
          order: 2,
          label: "Confirm password",
          required: true,
          config: {
            min_length: 8,
          },
        },
        {
          id: "submit",
          category: "BLOCK",
          type: "NEXT_BUTTON",
          order: 3,
          config: {
            text: "Set up AuthHero",
          },
        },
      ],
      ...(error
        ? {
          messages: [
            {
              type: "error",
              text: error,
            },
          ],
        }
        : {}),
    };
  }

  function getSuccessScreen(
    tenantId: string,
    isMultiTenant: boolean,
    hasAdminUi: boolean,
  ) {
    return {
      action: hasAdminUi ? "/admin" : "https://local.authhero.net",
      method: "GET",
      title: "Setup Complete",
      description: `Your ${isMultiTenant ? "control plane" : "tenant"} is ready.`,
      components: [
        {
          id: "info",
          category: "BLOCK",
          type: "RICH_TEXT",
          order: 0,
          config: {
            content: `
            <div style="margin-bottom: 16px;">
              <div style="font-size: 13px; color: #6b7280; margin-bottom: 4px;">Mode</div>
              <div style="font-size: 14px;">${isMultiTenant ? "Multi-tenant" : "Single-tenant"}</div>
            </div>
            <div>
              <div style="font-size: 13px; color: #6b7280; margin-bottom: 4px;">Tenant ID</div>
              <div style="font-size: 14px; font-family: monospace;">${tenantId}</div>
            </div>
            ${isMultiTenant ? '<p style="margin-top: 16px; font-size: 12px; color: #6b7280;">You can create additional tenants from the admin dashboard.</p>' : ""}
          `,
          },
        },
        {
          id: "continue",
          category: "BLOCK",
          type: "NEXT_BUTTON",
          order: 1,
          config: {
            text: "Continue",
          },
        },
      ],
    };
  }

  async function renderSetupPage(
    ctx: any,
    screen: Record<string, unknown>,
    screenId: string,
  ) {
    const screenJson = JSON.stringify(screen);

    const widgetHtml = await renderWidgetSSR({
      screenId,
      screenJson,
      state: "",
      authParamsJson: "{}",
    });

    return ctx.html(
      <WidgetPage
        widgetHtml={widgetHtml}
        screenId={screenId}
        clientName="AuthHero"
        language="en"
      />,
    );
  }

  // GET /setup - render the setup form
  setupApp.openapi(
    createRoute({
      tags: ["setup"],
      method: "get",
      path: "/",
      responses: {
        200: { description: "Setup form" },
        404: { description: "Setup not available (already configured)" },
      },
    }),
    async (ctx) => {
      const { tenants } = await ctx.env.data.tenants.list();
      if (tenants.length > 0) {
        const redirectUrl = hasAdminUi ? "/admin" : "/";
        return ctx.redirect(redirectUrl);
      }

      return renderSetupPage(ctx, getSetupScreen(), "setup");
    },
  );

  // POST /setup - process the setup form
  setupApp.openapi(
    createRoute({
      tags: ["setup"],
      method: "post",
      path: "/",
      request: {
        body: {
          content: {
            "application/json": {
              schema: z.object({
                data: z.object({
                  identifier: z.string().trim().min(1),
                  password: z.string().min(8),
                  confirm_password: z.string().min(8),
                  name: z.string().optional(),
                }),
              }),
            },
          },
        },
      },
      responses: {
        200: { description: "Setup complete" },
        400: { description: "Validation error" },
        404: { description: "Setup not available (already configured)" },
      },
    }),
    async (ctx) => {
      // Check if already set up
      const { tenants } = await ctx.env.data.tenants.list();
      if (tenants.length > 0) {
        return ctx.notFound();
      }

      const { identifier, password, confirm_password, name } =
        ctx.req.valid("json").data;

      // Validate passwords match
      if (password !== confirm_password) {
        const errorScreen = getSetupScreen("Passwords do not match.");
        const accept = ctx.req.header("Accept") || "";
        if (accept.includes("application/json")) {
          return ctx.json({ screen: errorScreen });
        }
        return renderSetupPage(ctx, errorScreen, "setup");
      }

      // Determine if identifier is an email or username
      const { connectionType, normalized, isValid } =
        getConnectionFromIdentifier(identifier);
      const adminUsername = normalized || identifier;
      const adminEmail =
        connectionType === "email" && isValid ? adminUsername : undefined;

      const tenantName = name || (isMultiTenant ? "Control Plane" : "My App");
      const tenantId = isMultiTenant
        ? "control_plane"
        : slugify(tenantName) || "my_app";

      // Build callback URLs from the current request origin
      const origin = new URL(ctx.req.url).origin;
      const callbacks = [
        `${origin}/auth-callback`,
        `${origin}/admin/auth-callback`,
        "https://manage.authhero.net/auth-callback",
        "https://local.authhero.net/auth-callback",
        "https://localhost:5173/auth-callback",
        "http://localhost:3000/auth-callback",
        "http://localhost:3000/admin/auth-callback",
      ];
      const allowedLogoutUrls = [
        origin,
        `${origin}/admin`,
        "https://manage.authhero.net",
        "https://local.authhero.net",
        "http://localhost:5173",
        "http://localhost:3000",
      ];

      await seed(ctx.env.data, {
        adminUsername,
        adminEmail,
        adminPassword: password,
        tenantId,
        tenantName,
        isControlPlane: isMultiTenant,
        callbacks,
        allowedLogoutUrls,
        debug: false,
      });

      // Redirect to the complete page
      const accept = ctx.req.header("Accept") || "";
      if (accept.includes("application/json")) {
        return ctx.json({ redirect: "/setup/complete" });
      }

      return ctx.redirect("/setup/complete");
    },
  );

  // GET /setup/complete - render the success page
  setupApp.openapi(
    createRoute({
      tags: ["setup"],
      method: "get",
      path: "/complete",
      responses: {
        200: { description: "Setup complete" },
        302: { description: "Redirect to setup if not configured" },
      },
    }),
    async (ctx) => {
      const { tenants } = await ctx.env.data.tenants.list();
      if (tenants.length === 0) {
        return ctx.redirect("/setup");
      }

      const tenantId = tenants[0]!.id;
      const successScreen = getSuccessScreen(
        tenantId,
        isMultiTenant,
        hasAdminUi,
      );

      return renderSetupPage(ctx, successScreen, "setup-complete");
    },
  );

  return setupApp;
}
