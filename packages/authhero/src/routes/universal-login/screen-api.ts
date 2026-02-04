/**
 * Screen API - Unified endpoint for getting screen configurations
 *
 * This API serves screen configurations from two sources:
 * 1. Built-in screens (from the registry in ./screens/registry.ts)
 * 2. Database-defined forms (fallback)
 *
 * Built-in screen IDs: identifier, enter-code, enter-password, signup, forgot-password, reset-password
 * Database forms: Any form stored in the database (typically prefixed with "form_" or custom IDs)
 *
 * Routes:
 * - GET /u2/screen/:screenId?state=... - Get screen configuration
 * - POST /u2/screen/:screenId?state=... - Submit form data and get next screen
 */

import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { Bindings, Variables } from "../../types";
import { initJSXRoute } from "./common";
import {
  getScreen,
  getScreenDefinition,
  isValidScreenId,
  listScreenIds,
} from "./screens/registry";
import type { ScreenContext, ScreenBranding, ScreenResult } from "./screens/types";
import {
  createFrontChannelAuthResponse,
  completeLoginSessionHook,
  startLoginSessionContinuation,
} from "../../authentication-flows/common";
import {
  resolveNode,
  getRedirectUrl,
  FlowFetcher,
} from "../../hooks/formhooks";

/**
 * Branding response schema for OpenAPI
 */
const brandingResponseSchema = z.object({
  logo_url: z.string().optional(),
  favicon_url: z.string().optional(),
  powered_by_logo_url: z.string().optional(),
  colors: z
    .object({
      primary: z.string().optional(),
      page_background: z
        .union([
          z.string(),
          z.object({
            type: z.string().optional(),
            start: z.string().optional(),
            end: z.string().optional(),
            angle_deg: z.number().optional(),
          }),
        ])
        .optional(),
    })
    .optional(),
  font: z
    .object({
      url: z.string().optional(),
    })
    .optional(),
});

/**
 * Component message schema
 */
const componentMessageSchema = z.object({
  id: z.number().optional(),
  text: z.string(),
  type: z.enum(["info", "error", "success", "warning"]),
});

/**
 * Form component schema
 */
const formComponentSchema = z.object({
  id: z.string(),
  type: z.string(),
  category: z.string().optional(),
  config: z.record(z.any()).optional(),
  order: z.number().optional(),
  visible: z.boolean().optional(),
  required: z.boolean().optional(),
  sensitive: z.boolean().optional(),
  label: z.string().optional(),
  hint: z.string().optional(),
  messages: z.array(componentMessageSchema).optional(),
});

/**
 * UI Screen schema
 */
const uiScreenSchema = z.object({
  action: z.string(),
  method: z.enum(["POST", "GET"]),
  title: z.string().optional(),
  description: z.string().optional(),
  components: z.array(formComponentSchema),
  messages: z.array(componentMessageSchema).optional(),
  links: z
    .array(
      z.object({
        id: z.string().optional(),
        text: z.string(),
        href: z.string(),
        linkText: z.string().optional(),
      }),
    )
    .optional(),
});

/**
 * Screen API response schema
 */
const screenResponseSchema = z.object({
  screen: uiScreenSchema,
  branding: brandingResponseSchema.optional(),
});

/**
 * Convert database branding to ScreenBranding type
 */
function toScreenBranding(branding: any): ScreenBranding | undefined {
  if (!branding) return undefined;
  return {
    logo_url: branding.logo_url,
    favicon_url: branding.favicon_url,
    powered_by_logo_url: branding.powered_by_logo_url,
    colors: branding.colors,
    font: branding.font,
  };
}

/**
 * Build screen context from request
 */
async function buildScreenContext(
  ctx: any,
  state: string,
  prefill?: Record<string, string>,
  errors?: Record<string, string>,
): Promise<ScreenContext> {
  const {
    client,
    branding,
    theme: themeResult,
    loginSession,
  } = await initJSXRoute(ctx, state, true);

  const baseUrl = new URL(ctx.req.url).origin;

  // Use client.connections directly - EnrichedClient already has full Connection objects
  // populated by getClientWithDefaults, so no need to re-fetch from the database
  const connections = client.connections || [];

  return {
    ctx,
    tenant: client.tenant,
    client,
    theme: themeResult ?? undefined,
    branding: toScreenBranding(branding),
    connections,
    state,
    baseUrl,
    prefill: {
      ...prefill,
      username: loginSession?.authParams?.username,
      email: loginSession?.authParams?.username,
    },
    errors,
  };
}

/**
 * Get screen from built-in registry
 * Returns null if screen not found, or the screen result (may be a Promise for async screens)
 */
async function getBuiltInScreen(
  screenId: string,
  context: ScreenContext,
): Promise<ScreenResult | null> {
  if (!isValidScreenId(screenId)) {
    return null;
  }
  const result = getScreen(screenId, context);
  if (!result) {
    return null;
  }
  // Handle both sync and async screen factories
  return await result;
}

/**
 * Get screen from database form
 */
async function getDatabaseScreen(
  ctx: any,
  tenantId: string,
  formId: string,
  state: string,
  nodeId?: string,
  options?: {
    fieldErrors?: Record<string, string>;
    messages?: Array<{
      text: string;
      type: "error" | "info" | "success" | "warning";
    }>;
  },
) {
  const form = await ctx.env.data.forms.get(tenantId, formId);
  if (!form) {
    return null;
  }

  // Determine which node to render
  const targetNodeId = nodeId ?? form.start?.next_node;
  if (!targetNodeId) {
    return null;
  }

  // Find the STEP node
  const stepNode = (form.nodes || []).find(
    (n: any) => n.id === targetNodeId && n.type === "STEP",
  );
  if (!stepNode) {
    return null;
  }

  // Build action URL
  const actionUrl = `/u2/screen/${formId}?state=${encodeURIComponent(state)}${targetNodeId ? `&nodeId=${encodeURIComponent(targetNodeId)}` : ""}`;

  // Convert STEP node to UiScreen with field errors
  const components = [...stepNode.config.components]
    .filter((c: any) => c.visible !== false)
    .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0))
    .map((component: any) => {
      if (options?.fieldErrors?.[component.id]) {
        return {
          ...component,
          messages: [
            { text: options.fieldErrors[component.id], type: "error" as const },
          ],
        };
      }
      return component;
    });

  return {
    screen: {
      action: actionUrl,
      method: "POST" as const,
      title: form.name,
      components,
      messages: options?.messages,
    },
    formId,
    nodeId: targetNodeId,
    form,
    stepNode,
  };
}

export const screenApiRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>()
  // --------------------------------
  // GET /u2/screen/:screenId - Get screen configuration
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["screen-api"],
      method: "get",
      path: "/:screenId",
      request: {
        params: z.object({
          screenId: z.string().openapi({
            description: `Screen ID. Built-in screens: ${listScreenIds().join(", ")}. Or a database form ID.`,
          }),
        }),
        query: z.object({
          state: z.string().openapi({
            description: "The login session state",
          }),
          nodeId: z.string().optional().openapi({
            description: "Node ID for database forms (optional)",
          }),
        }),
      },
      responses: {
        200: {
          description: "Screen configuration",
          content: {
            "application/json": {
              schema: screenResponseSchema,
            },
          },
        },
        404: {
          description: "Screen not found",
        },
      },
    }),
    async (ctx) => {
      const { screenId } = ctx.req.valid("param");
      const { state, nodeId } = ctx.req.valid("query");

      const screenContext = await buildScreenContext(ctx, state);

      // 1. Try built-in screens first
      const builtInResult = await getBuiltInScreen(screenId, screenContext);
      if (builtInResult) {
        // Override the action URL and links to use the u2 routes
        const screen = {
          ...builtInResult.screen,
          action: `/u2/screen/${screenId}?state=${encodeURIComponent(state)}`,
          // Update links to use u2 routes
          links: builtInResult.screen.links?.map((link) => ({
            ...link,
            href: link.href
              .replace("/u/widget/", "/u2/")
              .replace("/u/signup", "/u2/signup")
              .replace("/u/enter-", "/u2/enter-"),
          })),
        };
        return ctx.json({
          screen,
          branding: builtInResult.branding,
        });
      }

      // 2. Fallback to database forms
      const dbResult = await getDatabaseScreen(
        ctx,
        screenContext.tenant.id,
        screenId,
        state,
        nodeId,
      );
      if (dbResult) {
        return ctx.json({
          screen: dbResult.screen,
          branding: screenContext.branding,
        });
      }

      throw new HTTPException(404, {
        message: `Screen not found: ${screenId}. Available built-in screens: ${listScreenIds().join(", ")}`,
      });
    },
  )
  // --------------------------------
  // POST /u2/screen/:screenId - Submit form and get next screen
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["screen-api"],
      method: "post",
      path: "/:screenId",
      request: {
        params: z.object({
          screenId: z.string(),
        }),
        query: z.object({
          state: z.string(),
          nodeId: z.string().optional(),
        }),
        body: {
          content: {
            "application/json": {
              schema: z.object({
                data: z.record(z.string(), z.any()),
              }),
            },
          },
        },
      },
      responses: {
        200: {
          description: "Next screen or redirect",
          content: {
            "application/json": {
              schema: z.union([
                screenResponseSchema,
                z.object({ redirect: z.string() }),
                z.object({ complete: z.boolean() }),
              ]),
            },
          },
        },
        400: {
          description: "Validation error",
        },
        404: {
          description: "Screen not found",
        },
      },
    }),
    async (ctx) => {
      const { screenId } = ctx.req.valid("param");
      const { state, nodeId } = ctx.req.valid("query");
      const { data } = ctx.req.valid("json");

      // 1. Try built-in screen POST handler
      const definition = getScreenDefinition(screenId);
      if (definition?.handler.post) {
        const screenContext = await buildScreenContext(ctx, state);
        const result = await definition.handler.post(screenContext, data);

        // Handler returns { redirect } for external URLs (OAuth, final redirect)
        if ("redirect" in result) {
          return ctx.json({ redirect: result.redirect });
        }

        // Handler returns { screen } for internal navigation
        // Override action URL to use the screen-api endpoint for JSON submissions
        const baseUrl = new URL(ctx.req.url).origin;
        const screenData = result.screen;
        const nextScreenId = screenData.screen.action?.match(/\/u2\/(?:screen\/)?([^/?]+)/)?.[1] || screenId;
        
        return ctx.json({
          screen: {
            ...screenData.screen,
            // Widget will POST JSON here when JS is enabled
            action: `${baseUrl}/u2/screen/${nextScreenId}?state=${encodeURIComponent(state)}`,
            links: screenData.screen.links?.map((link) => ({
              ...link,
              href: link.href
                .replace("/u/widget/", "/u2/")
                .replace("/u/signup", "/u2/signup")
                .replace("/u/enter-", "/u2/enter-"),
            })),
          },
          branding: screenData.branding,
        }, "error" in result ? 400 : 200);
      }

      // 2. For built-in screens without POST handler, return error
      if (isValidScreenId(screenId)) {
        throw new HTTPException(400, {
          message: `Screen ${screenId} does not support POST submissions yet`,
        });
      }

      // 3. Fallback to database form handling
      const screenContext = await buildScreenContext(ctx, state);
      const dbResult = await getDatabaseScreen(
        ctx,
        screenContext.tenant.id,
        screenId,
        state,
        nodeId,
      );

      if (!dbResult) {
        throw new HTTPException(404, {
          message: `Screen not found: ${screenId}`,
        });
      }

      const { form, stepNode } = dbResult;

      // Validate required fields
      const fieldErrors: Record<string, string> = {};
      const components = stepNode.config.components;

      for (const comp of components) {
        if ("required" in comp && comp.required) {
          const value = data[comp.id];
          if (value === undefined || value === null || value === "") {
            fieldErrors[comp.id] = "This field is required";
          }
        }

        if (comp.type === "EMAIL" && data[comp.id]) {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(String(data[comp.id]))) {
            fieldErrors[comp.id] = "Please enter a valid email address";
          }
        }
      }

      // Return validation errors
      if (Object.keys(fieldErrors).length > 0) {
        const errorResult = await getDatabaseScreen(
          ctx,
          screenContext.tenant.id,
          screenId,
          state,
          dbResult.nodeId,
          {
            fieldErrors,
            messages: [
              { text: "Please correct the errors below", type: "error" },
            ],
          },
        );
        return ctx.json(
          { screen: errorResult!.screen, branding: screenContext.branding },
          400,
        );
      }

      // Get session
      const { client } = await initJSXRoute(ctx, state, true);
      const loginSession = await ctx.env.data.loginSessions.get(
        client.tenant.id,
        state,
      );

      if (!loginSession || !loginSession.authParams) {
        throw new HTTPException(400, { message: "Session expired" });
      }

      // Check for next_node
      const nextNodeId = stepNode.config?.next_node;

      if (nextNodeId && form.nodes) {
        const flowFetcher: FlowFetcher = async (flowId: string) => {
          const flow = await ctx.env.data.flows.get(client.tenant.id, flowId);
          if (!flow) return null;
          return {
            actions: flow.actions?.map((action: any) => ({
              type: action.type,
              action: action.action,
              params:
                "params" in action &&
                action.params &&
                typeof action.params === "object" &&
                "target" in action.params
                  ? {
                      target: action.params.target as
                        | "change-email"
                        | "account"
                        | "custom",
                      custom_url:
                        "custom_url" in action.params
                          ? action.params.custom_url
                          : undefined,
                    }
                  : undefined,
            })),
          };
        };

        let user: any = null;
        if (loginSession.session_id) {
          const session = await ctx.env.data.sessions.get(
            client.tenant.id,
            loginSession.session_id,
          );
          if (session?.user_id) {
            user = await ctx.env.data.users.get(
              ctx.var.tenant_id,
              session.user_id,
            );
          }
        }

        const resolveResult = await resolveNode(
          form.nodes,
          nextNodeId,
          { user },
          flowFetcher,
        );

        if (resolveResult) {
          if (resolveResult.type === "redirect") {
            const target = resolveResult.target as "change-email" | "account" | "custom";
            const redirectUrl = getRedirectUrl(
              target,
              resolveResult.customUrl,
              state,
            );

            // For account pages (change-email, account), use continuation state
            // This allows the user to access the page without full auth, but with scope validation
            if (target === "change-email" || target === "account") {
              // Return URL is /u/continue which will resume the login flow
              const returnUrl = `/u/continue?state=${encodeURIComponent(state)}`;
              await startLoginSessionContinuation(
                ctx,
                client.tenant.id,
                loginSession,
                [target], // Scope limited to the specific target
                returnUrl,
              );
            }

            return ctx.json({ redirect: redirectUrl });
          }

          if (resolveResult.type === "step") {
            const nextResult = await getDatabaseScreen(
              ctx,
              screenContext.tenant.id,
              screenId,
              state,
              resolveResult.nodeId,
            );
            if (nextResult) {
              return ctx.json({
                screen: nextResult.screen,
                branding: screenContext.branding,
              });
            }
          }
        }
      }

      // Complete auth flow
      if (loginSession.session_id) {
        const session = await ctx.env.data.sessions.get(
          client.tenant.id,
          loginSession.session_id,
        );

        if (session?.user_id) {
          const user = await ctx.env.data.users.get(
            ctx.var.tenant_id,
            session.user_id,
          );

          if (user) {
            // Complete any pending hook (idempotent - no-ops if not in AWAITING_HOOK state)
            await completeLoginSessionHook(ctx, client.tenant.id, loginSession);

            const result = await createFrontChannelAuthResponse(ctx, {
              authParams: loginSession.authParams,
              client,
              user,
              loginSession,
              skipHooks: true,
            });

            if (result.status === 302) {
              const location = result.headers.get("location");
              if (location) {
                return ctx.json({ redirect: location });
              }
            }
          }
        }
      }

      return ctx.json({ complete: true });
    },
  );
