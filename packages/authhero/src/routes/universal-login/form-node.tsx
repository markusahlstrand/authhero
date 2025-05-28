import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Bindings, Variables } from "../../types";
import { initJSXRoute } from "./common";
import FormNodePage from "../../components/FormNodePage";
import { HTTPException } from "hono/http-exception";

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
      const { client, vendorSettings } = await initJSXRoute(ctx, state);

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
      const { vendorSettings, client } = await initJSXRoute(ctx, state);

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
      // TODO: handle form submission, validation, next_node, etc.
      // For now, just re-render the form node
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
  );
