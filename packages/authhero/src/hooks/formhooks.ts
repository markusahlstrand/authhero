import { Context } from "hono";
import { Bindings, Variables } from "../types";
import { LoginSession } from "@authhero/adapter-interfaces";
import { HTTPException } from "hono/http-exception";

// Type guard for form hooks
export function isFormHook(
  hook: any,
): hook is { form_id: string; enabled: boolean } {
  return typeof hook.form_id === "string";
}

/**
 * Handles a form hook: validates the form exists and returns a redirect Response to the first node.
 * Throws if the form or start node is missing.
 */
export async function handleFormHook(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  form_id: string,
  loginSession?: LoginSession,
): Promise<Response> {
  const data = ctx.env.data;
  const tenant_id = ctx.var.tenant_id || ctx.req.header("tenant-id");
  if (!tenant_id) {
    throw new HTTPException(400, { message: "Missing tenant_id in context" });
  }
  const form = await data.forms.get(tenant_id, form_id);
  if (!form) {
    throw new HTTPException(404, {
      message: "Form not found for post-user-login hook",
    });
  }
  let firstNodeId = form.start?.next_node;
  if (!firstNodeId && form.nodes && form.nodes.length > 0) {
    const stepNode = form.nodes.find((n: any) => n.type === "STEP");
    firstNodeId = stepNode?.id;
  }
  if (!firstNodeId) {
    throw new HTTPException(400, { message: "No start node found in form" });
  }
  // If loginSession is provided, pass state as a query param if available
  let url = `/u/forms/${form.id}/nodes/${firstNodeId}`;
  const state = loginSession?.authParams?.state;
  if (state) {
    url += `?state=${encodeURIComponent(state)}`;
  }
  return new Response(null, {
    status: 302,
    headers: { location: url },
  });
}
