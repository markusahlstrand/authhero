import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Bindings, Variables } from "../../types";
import { initJSXRoute } from "./common";
import { HTTPException } from "hono/http-exception";
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
 * Local types for the flow API
 * These are simplified versions that work with the data adapter output
 */

interface ComponentMessage {
  id?: number;
  text: string;
  type: "info" | "error" | "success" | "warning";
}

interface FormComponent {
  id: string;
  type: string;
  category?: string;
  config?: Record<string, unknown>;
  order?: number;
  visible?: boolean;
  required?: boolean;
  sensitive?: boolean;
  label?: string;
  hint?: string;
  messages?: ComponentMessage[];
}

interface StepNodeConfig {
  components: FormComponent[];
  next_node?: string;
}

interface StepNode {
  id: string;
  type: "STEP";
  config: StepNodeConfig;
  alias?: string;
  coordinates?: { x: number; y: number };
}

interface UiScreen {
  action: string;
  method: "POST" | "GET";
  title?: string;
  description?: string;
  components: FormComponent[];
  messages?: ComponentMessage[];
  links?: { id?: string; text: string; href: string; linkText?: string }[];
}

/**
 * Helper to generate action URL based on mode
 * - Hosted mode (formId in path): /u/flow/:formId/screen?state=...&nodeId=...
 * - SPA mode (form in query): /u/flow/screen?form=...&state=...&screen=...
 */
function generateActionUrl(
  formId: string,
  state: string,
  nodeId?: string,
  mode: "hosted" | "spa" = "hosted",
): string {
  if (mode === "spa") {
    const params = new URLSearchParams({ form: formId, state });
    if (nodeId) params.set("screen", nodeId);
    return `/u/flow/screen?${params.toString()}`;
  }
  // Hosted mode - formId in path
  const params = new URLSearchParams({ state });
  if (nodeId) params.set("nodeId", nodeId);
  return `/u/flow/${formId}/screen?${params.toString()}`;
}

/**
 * Convert a STEP node to a UiScreen for widget rendering
 */
function stepToUiScreen(
  stepNode: StepNode,
  formId: string,
  state: string,
  options: {
    title?: string;
    description?: string;
    messages?: ComponentMessage[];
    fieldErrors?: Record<string, string>;
    mode?: "hosted" | "spa";
  } = {},
): UiScreen {
  const mode = options.mode ?? "hosted";

  // Sort components by order and filter visible ones
  const components = [...stepNode.config.components]
    .filter((c) => c.visible !== false)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((component) => {
      // Add field-specific error messages
      if (options.fieldErrors?.[component.id]) {
        return {
          ...component,
          messages: [
            { text: options.fieldErrors[component.id], type: "error" as const },
          ],
        } as FormComponent;
      }
      return component;
    });

  // Generate action URL based on mode
  const action = generateActionUrl(formId, state, undefined, mode);

  return {
    action,
    method: "POST",
    title: options.title ?? stepNode.alias ?? undefined,
    description: options.description,
    components: components,
    messages: options.messages,
    links: [], // Can be populated based on the flow context
  };
}

/**
 * Branding schema for widget theming
 */
const brandingResponseSchema = z.object({
  colors: z
    .object({
      primary: z.string().optional(),
      page_background: z.string().optional(),
    })
    .optional(),
  logo_url: z.string().optional(),
  favicon_url: z.string().optional(),
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
 * Form component schema (simplified)
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
 * UI Screen schema for OpenAPI documentation
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
 * Full API response schema
 */
const flowScreenResponseSchema = z.object({
  screen: uiScreenSchema,
  branding: brandingResponseSchema.optional(),
});

/**
 * Shared handler for GET screen requests (both path-based and query-based)
 */
async function handleGetScreen(
  ctx: any,
  formId: string,
  state: string,
  nodeId?: string,
  mode: "hosted" | "spa" = "hosted",
) {
  const { client, branding } = await initJSXRoute(ctx, state, true);

  const form = await ctx.env.data.forms.get(client.tenant.id, formId);

  if (!form) {
    throw new HTTPException(404, { message: "Form not found" });
  }

  // Determine which node to render
  const targetNodeId = nodeId ?? form.start?.next_node;

  if (!targetNodeId) {
    throw new HTTPException(400, { message: "No starting node defined" });
  }

  // Find the STEP node (cast to any to work around type mismatch between schemas)
  const stepNode = (form.nodes || []).find(
    (n: any) => n.id === targetNodeId && n.type === "STEP",
  ) as StepNode | undefined;

  if (!stepNode) {
    throw new HTTPException(404, {
      message: "Node not found or not a STEP node",
    });
  }

  const screen = stepToUiScreen(stepNode, formId, state, {
    title: form.name,
    mode,
  });

  return ctx.json({
    screen,
    branding: branding
      ? {
          colors: branding.colors,
          logo_url: branding.logo_url,
          favicon_url: branding.favicon_url,
          font: branding.font,
        }
      : undefined,
  });
}

/**
 * Shared handler for POST screen requests (both path-based and query-based)
 */
async function handlePostScreen(
  ctx: any,
  formId: string,
  state: string,
  nodeId: string | undefined,
  data: Record<string, unknown>,
  mode: "hosted" | "spa" = "hosted",
) {
  const { client, branding } = await initJSXRoute(ctx, state, true);

  const form = await ctx.env.data.forms.get(client.tenant.id, formId);

  if (!form) {
    throw new HTTPException(404, { message: "Form not found" });
  }

  // Determine which node was submitted
  const targetNodeId = nodeId ?? form.start?.next_node;

  if (!targetNodeId) {
    throw new HTTPException(400, { message: "No node specified" });
  }

  const stepNode = (form.nodes || []).find(
    (n: any) => n.id === targetNodeId && n.type === "STEP",
  ) as StepNode | undefined;

  if (!stepNode) {
    throw new HTTPException(404, {
      message: "Node not found or not a STEP node",
    });
  }

  // Validate required fields
  const fieldErrors: Record<string, string> = {};
  const components = stepNode.config.components;

  for (const comp of components) {
    // Check required fields
    if ("required" in comp && comp.required) {
      const value = data[comp.id];
      if (value === undefined || value === null || value === "") {
        fieldErrors[comp.id] = "This field is required";
      }
    }

    // Email validation
    if (comp.type === "EMAIL" && data[comp.id]) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(String(data[comp.id]))) {
        fieldErrors[comp.id] = "Please enter a valid email address";
      }
    }
  }

  // Return validation errors
  if (Object.keys(fieldErrors).length > 0) {
    const screen = stepToUiScreen(stepNode, formId, state, {
      title: form.name,
      fieldErrors,
      messages: [
        {
          text: "Please correct the errors below",
          type: "error",
        },
      ],
      mode,
    });

    return ctx.json({ screen, branding }, 400);
  }

  // Get session and user
  const loginSession = await ctx.env.data.loginSessions.get(
    client.tenant.id,
    state,
  );

  if (!loginSession || !loginSession.authParams) {
    throw new HTTPException(400, { message: "Session expired" });
  }

  // Check if there's a next_node in the STEP config
  const nextNodeId = stepNode.config?.next_node;

  if (nextNodeId && form.nodes) {
    // Create a flow fetcher for async flow resolution
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

    // Get user for router conditions
    let user: any = null;
    if (loginSession.session_id) {
      const session = await ctx.env.data.sessions.get(
        client.tenant.id,
        loginSession.session_id,
      );
      if (session?.user_id) {
        user = await ctx.env.data.users.get(ctx.var.tenant_id, session.user_id);
      }
    }

    // Resolve the next node
    const resolveResult = await resolveNode(
      form.nodes,
      nextNodeId,
      { user },
      flowFetcher,
    );

    if (resolveResult) {
      if (resolveResult.type === "redirect") {
        // FLOW or ACTION node with REDIRECT
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
        // Another STEP node - return the next screen
        const nextStepNode = (form.nodes || []).find(
          (n: any) => n.id === resolveResult.nodeId && n.type === "STEP",
        ) as StepNode | undefined;

        if (nextStepNode) {
          const screen = stepToUiScreen(nextStepNode, formId, state, {
            title: form.name,
            mode,
          });
          return ctx.json({
            screen,
            branding: branding
              ? {
                  colors: branding.colors,
                  logo_url: branding.logo_url,
                  favicon_url: branding.favicon_url,
                  font: branding.font,
                }
              : undefined,
          });
        }
      }
      // type === "end" - fall through to complete
    }
  }

  // No next_node or reached end - complete the auth flow
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
        // Transition from AWAITING_HOOK back to AUTHENTICATED
        await completeLoginSessionHook(ctx, client.tenant.id, loginSession);

        // Create auth response
        const result = await createFrontChannelAuthResponse(ctx, {
          authParams: loginSession.authParams,
          client,
          user,
          loginSession,
          skipHooks: true,
        });

        // Extract redirect URL from the response
        if (result.status === 302) {
          const location = result.headers.get("location");
          if (location) {
            return ctx.json({ redirect: location });
          }
        }
      }
    }
  }

  // Default completion response
  return ctx.json({ complete: true });
}

export const flowApiRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>()
  // --------------------------------
  // GET /u/flow/screen (SPA mode)
  // Returns the current screen with form in querystring
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["flow-api"],
      method: "get",
      path: "/screen",
      request: {
        query: z.object({
          form: z.string(),
          state: z.string(),
          screen: z.string().optional(),
        }),
      },
      responses: {
        200: {
          description: "Current screen for widget rendering (SPA mode)",
          content: {
            "application/json": {
              schema: flowScreenResponseSchema,
            },
          },
        },
        404: { description: "Form not found" },
      },
    }),
    async (ctx) => {
      const { form: formId, state, screen: nodeId } = ctx.req.valid("query");
      return handleGetScreen(ctx, formId, state, nodeId, "spa");
    },
  )
  // --------------------------------
  // GET /u/flow/:formId/screen (Hosted mode)
  // Returns the current screen for widget rendering
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["flow-api"],
      method: "get",
      path: "/:formId/screen",
      request: {
        params: z.object({
          formId: z.string(),
        }),
        query: z.object({
          state: z.string(),
          nodeId: z.string().optional(),
        }),
      },
      responses: {
        200: {
          description: "Current screen for widget rendering (hosted mode)",
          content: {
            "application/json": {
              schema: flowScreenResponseSchema,
            },
          },
        },
        404: { description: "Form not found" },
      },
    }),
    async (ctx) => {
      const { formId } = ctx.req.valid("param");
      const { state, nodeId } = ctx.req.valid("query");
      return handleGetScreen(ctx, formId, state, nodeId, "hosted");
    },
  )
  // --------------------------------
  // POST /u/flow/screen (SPA mode)
  // Handles form submission and returns next screen or redirect
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["flow-api"],
      method: "post",
      path: "/screen",
      request: {
        query: z.object({
          form: z.string(),
          state: z.string(),
          screen: z.string().optional(),
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
          description: "Next screen or completion response (SPA mode)",
          content: {
            "application/json": {
              schema: z.union([
                flowScreenResponseSchema,
                z.object({
                  redirect: z.string(),
                }),
                z.object({
                  complete: z.boolean(),
                  tokens: z
                    .object({
                      access_token: z.string().optional(),
                      id_token: z.string().optional(),
                      refresh_token: z.string().optional(),
                    })
                    .optional(),
                }),
              ]),
            },
          },
        },
        400: { description: "Validation error" },
        404: { description: "Form not found" },
      },
    }),
    async (ctx) => {
      const { form: formId, state, screen: nodeId } = ctx.req.valid("query");
      const { data } = ctx.req.valid("json");
      return handlePostScreen(ctx, formId, state, nodeId, data, "spa");
    },
  )
  // --------------------------------
  // POST /u/flow/:formId/screen (Hosted mode)
  // Handles form submission and returns next screen or redirect
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["flow-api"],
      method: "post",
      path: "/:formId/screen",
      request: {
        params: z.object({
          formId: z.string(),
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
          description: "Next screen or completion response (hosted mode)",
          content: {
            "application/json": {
              schema: z.union([
                flowScreenResponseSchema,
                z.object({
                  redirect: z.string(),
                }),
                z.object({
                  complete: z.boolean(),
                  tokens: z
                    .object({
                      access_token: z.string().optional(),
                      id_token: z.string().optional(),
                      refresh_token: z.string().optional(),
                    })
                    .optional(),
                }),
              ]),
            },
          },
        },
        400: { description: "Validation error" },
        404: { description: "Form not found" },
      },
    }),
    async (ctx) => {
      const { formId } = ctx.req.valid("param");
      const { state, nodeId } = ctx.req.valid("query");
      const { data } = ctx.req.valid("json");
      return handlePostScreen(ctx, formId, state, nodeId, data, "hosted");
    },
  );
