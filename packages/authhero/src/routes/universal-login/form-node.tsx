import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Bindings, Variables } from "../../types";
import { initJSXRoute } from "./common";
import FormNodePage from "../../components/FormNodePage";
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
  buildUserUpdates,
} from "../../hooks/formhooks";

export const formNodeRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>()
  // --------------------------------
  // GET /u/forms/:formId/nodes/:nodeId
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["forms"],
      method: "get",
      path: "/:formId/nodes/:nodeId",
      request: {
        params: z.object({
          formId: z.string(),
          nodeId: z.string(),
        }),
        query: z.object({
          state: z.string(),
        }),
      },
      responses: {
        200: { description: "Form node HTML" },
        404: { description: "Form or node not found" },
      },
    }),
    async (ctx) => {
      const { formId, nodeId } = ctx.req.valid("param");
      const { state } = ctx.req.valid("query");

      const { client, theme, branding } = await initJSXRoute(ctx, state, true);

      const form = await ctx.env.data.forms.get(client.tenant.id, formId);

      if (!form) {
        throw new HTTPException(404, { message: "Form not found" });
      }
      // Only STEP nodes have components
      const node = (form.nodes || []).find(
        (n: any) => n.id === nodeId && n.type === "STEP",
      );

      if (!node) {
        throw new HTTPException(404, {
          message: "Node not found or not a STEP node",
        });
      }

      return ctx.html(
        <FormNodePage
          theme={theme}
          branding={branding}
          client={client}
          state={state}
          formName={form.name}
          nodeAlias={node.alias || node.type}
          components={"components" in node.config ? node.config.components : []}
        />,
      );
    },
  )
  // --------------------------------
  // POST /u/forms/:formId/nodes/:nodeId
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["forms"],
      method: "post",
      path: "/:formId/nodes/:nodeId",
      request: {
        params: z.object({
          formId: z.string(),
          nodeId: z.string(),
        }),
        query: z.object({
          state: z.string(),
        }),
        body: {
          content: {
            "application/x-www-form-urlencoded": {
              schema: z.record(z.string()),
            },
          },
        },
      },
      responses: {
        200: { description: "Form node submitted" },
        404: { description: "Form or node not found" },
      },
    }),
    async (ctx) => {
      const { formId, nodeId } = ctx.req.valid("param");
      const { state } = ctx.req.valid("query");
      const { theme, branding, client } = await initJSXRoute(ctx, state, true);
      let form: any = undefined;
      let node: any = undefined;
      let components: any[] = [];
      try {
        form = await ctx.env.data.forms.get(client.tenant.id, formId);
        if (!form) throw new HTTPException(404, { message: "Form not found" });
        node = (form.nodes || []).find(
          (n: any) => n.id === nodeId && n.type === "STEP",
        );
        if (!node)
          throw new HTTPException(404, {
            message: "Node not found or not a STEP node",
          });
        components = "components" in node.config ? node.config.components : [];
        const body = await ctx.req.parseBody();
        const missingFields: string[] = [];
        const submittedFields: Record<string, string> = {};
        // Field component types that collect user input
        const fieldTypes = new Set([
          "LEGAL", "TEXT", "DATE", "DROPDOWN", "EMAIL", "NUMBER",
          "BOOLEAN", "CHOICE", "TEL", "URL", "PASSWORD", "CARDS",
        ]);
        for (const comp of components) {
          if (fieldTypes.has(comp.type)) {
            const name = comp.id;
            const isRequired = !!comp.required;
            const value = body[name];
            if (isRequired && (!value || value === "")) {
              missingFields.push(comp.label || name);
            }
            if (typeof value === "string" && value !== "") {
              submittedFields[name] = value;
            }
          }
        }
        if (missingFields.length > 0) {
          return ctx.html(
            <FormNodePage
              theme={theme}
              branding={branding}
              client={client}
              state={state}
              formName={form.name}
              nodeAlias={node.alias || node.type}
              components={components}
              error={`Missing required fields: ${missingFields.join(", ")}`}
            />,
          );
        }

        // All required fields present, continue with session and user lookup
        const loginSession = await ctx.env.data.loginSessions.get(
          client.tenant.id,
          state,
        );
        if (
          !loginSession ||
          !loginSession.session_id ||
          !loginSession.authParams
        ) {
          throw new Error("Session expired");
        }
        const session = await ctx.env.data.sessions.get(
          client.tenant.id,
          loginSession.session_id,
        );
        if (!session || !session.user_id) {
          throw new Error("Session expired");
        }
        const user = await ctx.env.data.users.get(
          ctx.var.tenant_id,
          session.user_id,
        );
        if (!user) {
          throw new Error("Session expired");
        }

        // Check if there's a next_node in the STEP config
        const nextNodeId = node.config?.next_node;
        if (nextNodeId && form.nodes) {
          // Create a flow fetcher for async flow resolution
          const flowFetcher: FlowFetcher = async (flowId: string) => {
            const flow = await ctx.env.data.flows.get(client.tenant.id, flowId);
            if (!flow) return null;
            return {
              actions: flow.actions?.map((action) => ({
                type: action.type,
                action: action.action,
                params: "params" in action && action.params ? action.params as Record<string, unknown> : undefined,
              })),
            };
          };

          // Resolve the next node (could be FLOW, ROUTER, ACTION, or another STEP)
          const resolveResult = await resolveNode(
            form.nodes,
            nextNodeId,
            { user, submittedFields },
            flowFetcher,
          );

          if (resolveResult) {
            // Execute any pending user updates from AUTH0 UPDATE_USER actions
            if (resolveResult.userUpdates && resolveResult.userUpdates.length > 0) {
              for (const update of resolveResult.userUpdates) {
                const userUpdates = buildUserUpdates(update.changes, user);
                await ctx.env.data.users.update(
                  client.tenant.id,
                  update.user_id,
                  userUpdates,
                );
              }
            }

            if (resolveResult.type === "redirect") {
              // FLOW or ACTION node with REDIRECT - redirect to the target
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

              return new Response(null, {
                status: 302,
                headers: { location: redirectUrl },
              });
            }

            if (resolveResult.type === "step") {
              // Another STEP node - redirect to it
              return new Response(null, {
                status: 302,
                headers: {
                  location: `/u/forms/${formId}/nodes/${resolveResult.nodeId}?state=${encodeURIComponent(state)}`,
                },
              });
            }

            // type === "end" - fall through to complete the auth flow
          }
        }

        // No next_node or reached end - complete the auth flow
        // Transition from AWAITING_HOOK back to AUTHENTICATED
        await completeLoginSessionHook(ctx, client.tenant.id, loginSession);

        const result = await createFrontChannelAuthResponse(ctx, {
          authParams: loginSession.authParams,
          client,
          user,
          loginSession,
          skipHooks: true,
        });
        return result;
      } catch (err) {
        return ctx.html(
          <FormNodePage
            theme={theme}
            branding={branding}
            client={client}
            state={state}
            formName={form?.name || ""}
            nodeAlias={node?.alias || nodeId || ""}
            components={components || []}
            error={"Your session has expired. Please try again."}
          />,
        );
      }
    },
  );
