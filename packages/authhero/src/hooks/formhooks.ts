import { Context } from "hono";
import { Bindings, Variables } from "../types";
import { LoginSession, Node, User } from "@authhero/adapter-interfaces";
import { HTTPException } from "hono/http-exception";

// Type guard for form hooks
export function isFormHook(
  hook: any,
): hook is { form_id: string; enabled: boolean } {
  return typeof hook.form_id === "string";
}

/**
 * Resolves a template string like "{{context.user.email}}" to its actual value
 */
function resolveTemplateField(field: string, context: { user: User }): string {
  const match = field.match(/^\{\{context\.user\.(\w+)\}\}$/);
  if (match) {
    const key = match[1] as keyof User;
    const value = context.user[key];
    return typeof value === "string" ? value : "";
  }
  return field;
}

/**
 * Evaluates a router condition against the current context
 */
function evaluateCondition(
  condition: {
    operator?: string;
    field?: string;
    value?: string;
    operands?: Array<{ operator: string; operands: string[] }>;
  },
  context: { user: User },
): boolean {
  // Handle the operator at the condition level
  const operator = condition.operator?.toLowerCase();
  const field = condition.field
    ? resolveTemplateField(condition.field, context)
    : "";
  const value = condition.value || "";

  switch (operator) {
    case "ends_with":
      return field.endsWith(value);
    case "starts_with":
      return field.startsWith(value);
    case "contains":
      return field.includes(value);
    case "equals":
    case "eq":
      return field === value;
    case "not_equals":
    case "neq":
      return field !== value;
    default:
      // Also check nested operands for ENDS_WITH etc
      if (condition.operands && Array.isArray(condition.operands)) {
        for (const operand of condition.operands) {
          if (
            operand.operator === "ENDS_WITH" &&
            Array.isArray(operand.operands) &&
            operand.operands.length >= 2
          ) {
            const fieldName = operand.operands[0];
            const matchValue = operand.operands[1];
            if (fieldName && matchValue) {
              const resolvedField = resolveTemplateField(
                `{{context.user.${fieldName}}}`,
                context,
              );
              if (resolvedField.endsWith(matchValue)) {
                return true;
              }
            }
          }
        }
      }
      return false;
  }
}

/**
 * Router node type definition
 */
interface RouterNode {
  id: string;
  type: "ROUTER";
  config: {
    rules: Array<{
      id: string;
      alias?: string;
      condition: {
        operator?: string;
        field?: string;
        value?: string;
        operands?: Array<{ operator: string; operands: string[] }>;
      };
      next_node: string;
    }>;
    fallback: string;
  };
}

/**
 * Resolves the first STEP node to display by following ROUTER nodes
 */
function resolveStepNode(
  nodes: Node[],
  startNodeId: string,
  context: { user: User },
  maxDepth = 10,
): string | null {
  let currentNodeId = startNodeId;
  let depth = 0;

  while (depth < maxDepth) {
    // Check for ending
    if (currentNodeId === "$ending") {
      return null;
    }

    const node = nodes.find((n) => n.id === currentNodeId);
    if (!node) {
      return null;
    }

    // If it's a STEP node, we found our target
    if (node.type === "STEP") {
      return node.id;
    }

    // If it's a ROUTER node, evaluate its rules
    if (node.type === "ROUTER") {
      const routerNode = node as unknown as RouterNode;
      let nextNodeId: string | null = null;

      // Evaluate rules in order
      for (const rule of routerNode.config.rules) {
        if (evaluateCondition(rule.condition, context)) {
          nextNodeId = rule.next_node;
          break;
        }
      }

      // Use fallback if no rule matched
      if (!nextNodeId) {
        nextNodeId = routerNode.config.fallback;
      }

      if (!nextNodeId) {
        return null;
      }

      currentNodeId = nextNodeId;
      depth++;
      continue;
    }

    // Unknown node type
    return null;
  }

  // Max depth exceeded
  return null;
}

/**
 * Handles a form hook: validates the form exists and returns a redirect Response to the first node.
 * Throws if the form or start node is missing.
 */
export async function handleFormHook(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  form_id: string,
  loginSession: LoginSession,
  user?: User,
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
    const stepNode = form.nodes.find((n: Node) => n.type === "STEP");
    firstNodeId = stepNode?.id;
  }
  if (!firstNodeId) {
    throw new HTTPException(400, { message: "No start node found in form" });
  }

  // If we have a user, resolve through any ROUTER nodes to find the actual STEP node
  if (user && form.nodes) {
    const resolvedNodeId = resolveStepNode(form.nodes, firstNodeId, { user });

    // If resolution leads to $ending or no node, skip the form
    if (!resolvedNodeId) {
      // No step node to display - this means the flow should end
      // Return a redirect that continues the auth flow without showing a form
      return new Response(null, {
        status: 302,
        headers: {
          location: `/u/login/identifier?state=${encodeURIComponent(loginSession.id)}`,
        },
      });
    }

    firstNodeId = resolvedNodeId;
  }

  // If loginSession is provided, pass state as a query param if available
  let url = `/u/forms/${form.id}/nodes/${firstNodeId}?state=${encodeURIComponent(
    loginSession.id,
  )}`;

  return new Response(null, {
    status: 302,
    headers: { location: url },
  });
}
