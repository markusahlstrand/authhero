import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Bindings, Variables } from "../../types";
import { initJSXRoute } from "./common";
import FormComponent from "../../components/Form";
import { HTTPException } from "hono/http-exception";

export const formNodeRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>()
  // --------------------------------
  // GET /u/form/:formId/nodes/:nodeId
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
      await initJSXRoute(ctx, state); // Only for session validation
      const tenantId = ctx.var.tenant_id;
      const form = await ctx.env.data.forms.get(tenantId, formId);
      if (!form) throw new HTTPException(404, { message: "Form not found" });
      // Only STEP nodes have components
      const node = (form.nodes || []).find(
        (n: any) => n.id === nodeId && n.type === "STEP",
      );
      if (!node)
        throw new HTTPException(404, {
          message: "Node not found or not a STEP node",
        });
      // Render node components (simple example)
      return ctx.html(
        <FormComponent>
          <h1>{form.name}</h1>
          <div>{node.alias || node.type}</div>
          {node.config &&
            "components" in node.config &&
            (node.config.components || []).map((comp: any) => {
              if (comp.type === "RICH_TEXT") {
                return (
                  <div
                    key={comp.id}
                    dangerouslySetInnerHTML={{ __html: comp.config.content }}
                  />
                );
              }
              if (comp.type === "LEGAL") {
                return (
                  <label key={comp.id}>
                    <input
                      type="checkbox"
                      name={comp.id}
                      required={!!comp.required}
                    />
                    <span
                      dangerouslySetInnerHTML={{ __html: comp.config.text }}
                    />
                  </label>
                );
              }
              if (comp.type === "NEXT_BUTTON") {
                return (
                  <button key={comp.id} type="submit">
                    {comp.config.text || "Continue"}
                  </button>
                );
              }
              return null;
            })}
        </FormComponent>,
      );
    },
  )
  // --------------------------------
  // POST /u/form/:formId/nodes/:nodeId
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
      await initJSXRoute(ctx, state); // Only for session validation
      const tenantId = ctx.var.tenant_id;
      const form = await ctx.env.data.forms.get(tenantId, formId);
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
        <FormComponent>
          <h1>{form.name}</h1>
          <div>{node.alias || node.type}</div>
          <div>Form submitted! (not yet implemented)</div>
        </FormComponent>,
      );
    },
  );
