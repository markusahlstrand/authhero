import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Bindings, Variables } from "../../types";
import { initJSXRoute } from "./common";
import FormNodePage from "../../components/FormNodePage";
import { HTTPException } from "hono/http-exception";
import { createAuthResponse } from "../../authentication-flows/common";

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

      const { client, vendorSettings } = await initJSXRoute(ctx, state, true);

      console.log("Client:", client);

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
          vendorSettings={vendorSettings}
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
      // Use initJSXRoute to get vendorSettings and client for POST as well
      const { vendorSettings, client } = await initJSXRoute(ctx, state, true);

      const form = await ctx.env.data.forms.get(client.tenant.id, formId);
      if (!form) throw new HTTPException(404, { message: "Form not found" });
      // Only STEP nodes have components
      const node = (form.nodes || []).find(
        (n: any) => n.id === nodeId && n.type === "STEP",
      );
      if (!node)
        throw new HTTPException(404, {
          message: "Node not found or not a STEP node",
        });

      // Get all components for the node
      const components =
        "components" in node.config ? node.config.components : [];
      // Get posted values
      const body = await ctx.req.parseBody();
      // Only validate LEGAL components for required fields
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

      if (missingFields.length === 0) {
        // All required fields present, call createAuthResponse

        // Fetch the login session using the state
        const loginSession = await ctx.env.data.loginSessions.get(
          client.tenant.id,
          state,
        );

        if (
          !loginSession ||
          !loginSession.session_id ||
          !loginSession.authParams
        ) {
          return ctx.html(
            <FormNodePage
              vendorSettings={vendorSettings}
              client={client}
              state={state}
              formName={form.name}
              nodeAlias={node.alias || node.type}
              components={components}
              error={"Invalid or missing login session for state: " + state}
            />,
          );
        }

        // Fetch or create the user
        const session = await ctx.env.data.sessions.get(
          client.tenant.id,
          loginSession.session_id,
        );

        if (!session || !session.user_id) {
          return ctx.html(
            <FormNodePage
              vendorSettings={vendorSettings}
              client={client}
              state={state}
              formName={form.name}
              nodeAlias={node.alias || node.type}
              components={components}
              error={"Invalid session for state: " + state}
            />,
          );
        }

        console.log("Session user_id:", session.user_id);

        const user = await ctx.env.data.users.get(
          ctx.var.tenant_id,
          session.user_id,
        );

        if (!user) {
          return ctx.html(
            <FormNodePage
              vendorSettings={vendorSettings}
              client={client}
              state={state}
              formName={form.name}
              nodeAlias={node.alias || node.type}
              components={components}
              error={"Invalid session for state: " + state}
            />,
          );
        }

        const result = await createAuthResponse(ctx, {
          authParams: loginSession.authParams,
          client,
          user,
          loginSession,
        });
        if (result instanceof Response) {
          return result;
        } else {
          return ctx.json(result);
        }
      } else {
        // Missing required fields, re-render form with error
        return ctx.html(
          <FormNodePage
            vendorSettings={vendorSettings}
            client={client}
            state={state}
            formName={form.name}
            nodeAlias={node.alias || node.type}
            components={components}
            error={`Missing required fields: ${missingFields.join(", ")}`}
          />,
        );
      }
    },
  );
