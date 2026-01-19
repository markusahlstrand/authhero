import { Context } from "hono";
import { Bindings, Variables } from "../types";
import { LoginSession, Node, User } from "@authhero/adapter-interfaces";
import { HTTPException } from "hono/http-exception";
import {
  startLoginSessionHook,
  startLoginSessionContinuation,
} from "../authentication-flows/common";

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
 * Action node type definition
 */
interface ActionNode {
  id: string;
  type: "ACTION";
  config: {
    action_type: "REDIRECT";
    target: "change-email" | "account" | "custom";
    custom_url?: string;
    next_node: string;
  };
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
 * Flow node type definition
 */
interface FlowNodeDef {
  id: string;
  type: "FLOW";
  config: {
    flow_id: string;
    next_node?: string;
  };
}

/**
 * Flow action type used during resolution
 */
interface FlowAction {
  type: string;
  action?: string;
  params?: {
    target?: "change-email" | "account" | "custom";
    custom_url?: string;
  };
}

/**
 * Flow fetcher function type for async flow resolution
 */
export type FlowFetcher = (flowId: string) => Promise<{
  actions?: FlowAction[];
} | null>;

/**
 * Result type for node resolution
 */
type ResolveNodeResult =
  | { type: "step"; nodeId: string }
  | { type: "redirect"; target: string; customUrl?: string }
  | { type: "end" }
  | null;

/**
 * Resolves the target redirect URL based on the target type
 */
export function getRedirectUrl(
  target: "change-email" | "account" | "custom",
  customUrl: string | undefined,
  state: string,
): string {
  switch (target) {
    case "change-email":
      return `/u/account/change-email?state=${encodeURIComponent(state)}`;
    case "account":
      return `/u/account?state=${encodeURIComponent(state)}`;
    case "custom":
      if (!customUrl) {
        throw new HTTPException(400, {
          message: "Custom URL is required for custom redirect target",
        });
      }
      // Append state to custom URL
      const url = new URL(customUrl, "http://placeholder");
      url.searchParams.set("state", state);
      return url.pathname + url.search;
    default:
      throw new HTTPException(400, {
        message: `Unknown redirect target: ${target}`,
      });
  }
}

/**
 * Resolves the first displayable node by following ROUTER, ACTION, and FLOW nodes
 */
export async function resolveNode(
  nodes: Node[],
  startNodeId: string,
  context: { user: User },
  flowFetcher?: FlowFetcher,
  maxDepth = 10,
): Promise<ResolveNodeResult> {
  let currentNodeId = startNodeId;
  let depth = 0;

  while (depth < maxDepth) {
    // Check for ending
    if (currentNodeId === "$ending") {
      return { type: "end" };
    }

    const node = nodes.find((n) => n.id === currentNodeId);
    if (!node) {
      return null;
    }

    // If it's a STEP node, we found our target
    if (node.type === "STEP") {
      return { type: "step", nodeId: node.id };
    }

    // If it's an ACTION node with REDIRECT, return redirect info
    if (node.type === "ACTION") {
      const actionNode = node as unknown as ActionNode;
      if (actionNode.config.action_type === "REDIRECT") {
        return {
          type: "redirect",
          target: actionNode.config.target,
          customUrl: actionNode.config.custom_url,
        };
      }
      // For other action types, move to next node
      currentNodeId = actionNode.config.next_node;
      depth++;
      continue;
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

    // If it's a FLOW node, fetch the referenced flow and execute its actions
    if (node.type === "FLOW") {
      const flowNode = node as unknown as FlowNodeDef;
      if (flowFetcher && flowNode.config.flow_id) {
        const flow = await flowFetcher(flowNode.config.flow_id);
        if (flow && flow.actions && flow.actions.length > 0) {
          // Process flow actions - look for REDIRECT_USER action
          for (const action of flow.actions) {
            if (
              action.type === "REDIRECT" &&
              action.action === "REDIRECT_USER"
            ) {
              const target = action.params?.target;
              if (target) {
                return {
                  type: "redirect",
                  target,
                  customUrl: action.params?.custom_url,
                };
              }
            }
          }
        }
      }
      // If no redirect action found or flow not found, continue to next node
      if (flowNode.config.next_node) {
        currentNodeId = flowNode.config.next_node;
        depth++;
        continue;
      }
      // No next_node configured, treat as end
      return { type: "end" };
    }

    // Unknown node type
    return null;
  }

  // Max depth exceeded
  return null;
}

/**
 * Handles a form hook: validates the form exists and returns a redirect Response to the first node.
 * If the form resolves to 'end' or no step node is found, returns the user to continue normal auth flow.
 * Throws if the form or start node is missing.
 */
export async function handleFormHook(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  form_id: string,
  loginSession: LoginSession,
  user?: User,
): Promise<User | Response> {
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

  // If we have a user, resolve through ROUTER, ACTION, and FLOW nodes
  if (user && form.nodes) {
    // Create a flow fetcher that uses the data adapter
    const flowFetcher: FlowFetcher = async (flowId: string) => {
      const flow = await data.flows.get(tenant_id, flowId);
      if (!flow) return null;
      // Map the flow actions to the expected FlowAction interface
      return {
        actions: flow.actions?.map((action) => ({
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

    const result = await resolveNode(
      form.nodes,
      firstNodeId,
      { user },
      flowFetcher,
    );

    // Handle different resolution results
    if (!result || result.type === "end") {
      // No step node to display - this means the flow should end
      // Return the user to continue normal auth flow without showing a form
      return user;
    }

    if (result.type === "redirect") {
      // ACTION or FLOW node with REDIRECT - redirect to the target
      const target = result.target as "change-email" | "account" | "custom";
      const redirectUrl = getRedirectUrl(
        target,
        result.customUrl,
        loginSession.id,
      );

      // For account pages (change-email, account), use continuation state
      // This allows the user to access the page without full auth, but with scope validation
      if (target === "change-email" || target === "account") {
        // Return URL is /u/continue which will resume the login flow
        const returnUrl = `/u/continue?state=${encodeURIComponent(loginSession.id)}`;
        await startLoginSessionContinuation(
          ctx,
          tenant_id,
          loginSession,
          [target], // Scope limited to the specific target
          returnUrl,
        );
      } else {
        // For custom URLs, use the regular hook mechanism
        await startLoginSessionHook(
          ctx,
          tenant_id,
          loginSession,
          `form:${form_id}`,
        );
      }

      return new Response(null, {
        status: 302,
        headers: { location: redirectUrl },
      });
    }

    // result.type === "step" - continue with form display
    firstNodeId = result.nodeId;
  }

  // Mark login session as awaiting hook before redirecting to form
  await startLoginSessionHook(ctx, tenant_id, loginSession, `form:${form_id}`);

  // If loginSession is provided, pass state as a query param if available
  let url = `/u/forms/${form.id}/nodes/${firstNodeId}?state=${encodeURIComponent(
    loginSession.id,
  )}`;

  return new Response(null, {
    status: 302,
    headers: { location: url },
  });
}
