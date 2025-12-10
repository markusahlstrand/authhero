import { Context } from "hono";
import { Bindings, Variables } from "../types";
import { LoginSession, Node } from "@authhero/adapter-interfaces";
import { HTTPException } from "hono/http-exception";

// Type guard for form hooks
export function isFormHook(
  hook: any,
): hook is { form_id: string; enabled: boolean } {
  return typeof hook.form_id === "string";
}

// Router rule interface
interface RouterRule {
  id: string;
  alias?: string;
  condition: any;
  next_node: string;
}

// Router node interface
interface RouterNode {
  id: string;
  type: "ROUTER";
  config: {
    rules: RouterRule[];
    fallback: string;
  };
}

/**
 * Evaluates a single condition operand against the context
 */
function evaluateOperand(
  operand: { operator: string; operands: any[] },
  context: Record<string, any>,
): boolean {
  const { operator, operands } = operand;
  const fieldName = operands[0];
  const fieldValue = context[fieldName];
  const compareValue = operands[1];

  switch (operator) {
    case "EQUALS":
      return fieldValue === compareValue;
    case "NOT_EQUALS":
      return fieldValue !== compareValue;
    case "CONTAINS":
      return (
        typeof fieldValue === "string" && fieldValue.includes(compareValue)
      );
    case "NOT_CONTAINS":
      return (
        typeof fieldValue === "string" && !fieldValue.includes(compareValue)
      );
    case "STARTS_WITH":
      return (
        typeof fieldValue === "string" && fieldValue.startsWith(compareValue)
      );
    case "ENDS_WITH":
      return (
        typeof fieldValue === "string" && fieldValue.endsWith(compareValue)
      );
    case "HAS_VALUE":
      return (
        fieldValue !== undefined && fieldValue !== null && fieldValue !== ""
      );
    case "IS_EMPTY":
      return (
        fieldValue === undefined || fieldValue === null || fieldValue === ""
      );
    case "GREATER_THAN":
      return (
        typeof fieldValue === "number" &&
        typeof compareValue === "number" &&
        fieldValue > compareValue
      );
    case "LESS_THAN":
      return (
        typeof fieldValue === "number" &&
        typeof compareValue === "number" &&
        fieldValue < compareValue
      );
    default:
      return false;
  }
}

/**
 * Evaluates a router condition against the context
 */
function evaluateCondition(
  condition: any,
  context: Record<string, any>,
): boolean {
  if (!condition || !condition.operator) return false;

  const { operator, operands } = condition;

  if (operator === "AND") {
    return (operands || []).every((op: any) => {
      if (op.operator === "AND" || op.operator === "OR") {
        return evaluateCondition(op, context);
      }
      return evaluateOperand(op, context);
    });
  }

  if (operator === "OR") {
    return (operands || []).some((op: any) => {
      if (op.operator === "AND" || op.operator === "OR") {
        return evaluateCondition(op, context);
      }
      return evaluateOperand(op, context);
    });
  }

  // Single condition (not wrapped in AND/OR)
  return evaluateOperand(condition, context);
}

/**
 * Evaluates a router node and returns the next node ID based on rules
 */
export function evaluateRouter(
  router: RouterNode,
  context: Record<string, any>,
): string {
  for (const rule of router.config.rules) {
    if (evaluateCondition(rule.condition, context)) {
      return rule.next_node;
    }
  }
  return router.config.fallback;
}

/**
 * Resolves the next renderable STEP node, evaluating any ROUTER nodes along the way.
 * Returns the STEP node ID or "$ending" if the flow should end.
 * @param nodeId - The starting node ID to resolve
 * @param nodes - Array of all nodes in the form
 * @param context - Context object for evaluating router conditions (e.g., user data)
 * @param maxDepth - Maximum depth to prevent infinite loops (default: 10)
 */
export function resolveNextStepNode(
  nodeId: string | undefined,
  nodes: any[],
  context: Record<string, any>,
  maxDepth: number = 10,
): string | null {
  if (!nodeId || nodeId === "$ending") {
    return nodeId || null;
  }

  let currentNodeId = nodeId;
  let depth = 0;

  while (depth < maxDepth) {
    const node = nodes.find((n: any) => n.id === currentNodeId);

    if (!node) {
      // Node not found
      return null;
    }

    if (node.type === "STEP") {
      // Found a STEP node, return it
      return node.id;
    }

    if (node.type === "ROUTER") {
      // Evaluate router and get next node
      const nextNodeId = evaluateRouter(node as RouterNode, context);
      if (nextNodeId === "$ending") {
        return "$ending";
      }
      currentNodeId = nextNodeId;
      depth++;
      continue;
    }

    if (node.type === "FLOW") {
      // For FLOW nodes, we might need to handle differently
      // For now, just follow the next_node
      if (node.config?.next_node) {
        currentNodeId = node.config.next_node;
        depth++;
        continue;
      }
      return null;
    }

    // Unknown node type
    return null;
  }

  // Max depth reached (possible infinite loop)
  console.warn("Max depth reached in resolveNextStepNode - possible loop");
  return null;
}

/**
 * Builds a context object for router evaluation from user and session data
 */
export function buildRouterContext(
  user?: any,
  loginSession?: LoginSession,
): Record<string, any> {
  return {
    // User fields
    user_id: user?.id,
    email: user?.email,
    email_verified: user?.email_verified,
    name: user?.name,
    nickname: user?.nickname,
    picture: user?.picture,
    // AuthParams fields (some may be custom)
    ...(loginSession?.authParams || {}),
    // Add more fields as needed
    ...user?.user_metadata,
    ...user?.app_metadata,
  };
}

/**
 * Handles a form hook: validates the form exists and returns a redirect Response to the first STEP node.
 * Evaluates any ROUTER nodes to determine the correct path.
 * Throws if the form or start node is missing.
 */
export async function handleFormHook(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  form_id: string,
  loginSession: LoginSession,
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

  let startNodeId = form.start?.next_node;
  if (!startNodeId && form.nodes && form.nodes.length > 0) {
    const stepNode = form.nodes.find((n: Node) => n.type === "STEP");
    startNodeId = stepNode?.id;
  }
  if (!startNodeId) {
    throw new HTTPException(400, { message: "No start node found in form" });
  }

  // Build context for router evaluation
  let user: any = undefined;
  if (loginSession.session_id) {
    const session = await data.sessions.get(tenant_id, loginSession.session_id);
    if (session?.user_id) {
      user = await data.users.get(tenant_id, session.user_id);
    }
  }
  const routerContext = buildRouterContext(user, loginSession);

  // Resolve through any routers to find the actual STEP node
  const resolvedNodeId = resolveNextStepNode(
    startNodeId,
    form.nodes || [],
    routerContext,
  );

  if (!resolvedNodeId || resolvedNodeId === "$ending") {
    // Flow ends immediately - this could happen if all routers lead to ending
    // For now, throw an error. In the future, this could redirect to ending handling.
    throw new HTTPException(400, {
      message: "Form flow ends without any steps",
    });
  }

  // Redirect to the resolved STEP node
  const url = `/u/forms/${form.id}/nodes/${resolvedNodeId}?state=${encodeURIComponent(
    loginSession.id,
  )}`;

  return new Response(null, {
    status: 302,
    headers: { location: url },
  });
}
