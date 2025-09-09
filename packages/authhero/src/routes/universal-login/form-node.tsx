import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Bindings, Variables } from "../../types";
import { initJSXRoute } from "./common";
import FormNodePage from "../../components/FormNodePage";
import { HTTPException } from "hono/http-exception";
import { createFrontChannelAuthResponse } from "../../authentication-flows/common";

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
        for (const comp of components) {
          if (comp.type === "LEGAL") {
            const name = comp.id;
            const isRequired = !!comp.required;
            const value = body[name];
            if (isRequired && (!value || value === "")) {
              missingFields.push(name);
            } else if (typeof value === "string") {
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
        const result = await createFrontChannelAuthResponse(ctx, {
          authParams: loginSession.authParams,
          client,
          user,
          loginSession,
          hookCalled: true,
        });
        if (result instanceof Response) {
          return result;
        } else {
          return ctx.json(result);
        }
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
