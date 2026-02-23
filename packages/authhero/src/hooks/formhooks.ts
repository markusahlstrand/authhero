import { Context } from "hono";
import { Bindings, Variables } from "../types";
import { LoginSession, Node, User } from "@authhero/adapter-interfaces";
import { HTTPException } from "hono/http-exception";
import {
  startLoginSessionHook,
  startLoginSessionContinuation,
} from "../authentication-flows/common";
import { EnrichedClient } from "../helpers/client";

// Type guard for form hooks
export function isFormHook(
  hook: any,
): hook is { form_id: string; enabled: boolean } {
  return typeof hook.form_id === "string";
}

/**
 * Resolves a template string like "{{context.user.email}}", "{{user.id}}", or "{{$form.gender}}" to its actual value
 */
export function resolveTemplateField(field: string, context: ResolveContext): string | undefined {
  // Match patterns like {{context.user.email}} or {{context.user.user_metadata.country}}
  const contextMatch = field.match(/^\{\{context\.user\.(.+)\}\}$/);
  if (contextMatch && contextMatch[1]) {
    return resolveNestedPath(context.user, contextMatch[1]);
  }

  // Match patterns like {{user.id}} or {{user.email}}
  const userMatch = field.match(/^\{\{user\.(.+)\}\}$/);
  if (userMatch && userMatch[1]) {
    return resolveNestedPath(context.user, userMatch[1]);
  }

  // Match patterns like {{$form.gender}} for submitted form field values (Auth0 standard)
  const fieldsMatch = field.match(/^\{\{\$form\.(.+)\}\}$/);
  if (fieldsMatch && fieldsMatch[1] && context.submittedFields) {
    const value = context.submittedFields[fieldsMatch[1]];
    return value !== undefined ? String(value) : undefined;
  }

  return field;
}

/**
 * Resolves a dot-separated path on an object
 */
function resolveNestedPath(obj: unknown, path: string): string | undefined {
  const parts = path.split(".");
  let value: unknown = obj;
  for (const part of parts) {
    if (value && typeof value === "object" && part in value) {
      value = (value as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return typeof value === "string" ? value : (value === undefined || value === null ? undefined : String(value));
}

/**
 * Resolves all template strings in a record of values
 */
function resolveTemplateValues(
  changes: Record<string, unknown>,
  context: ResolveContext,
): Record<string, string> {
  const resolved: Record<string, string> = {};
  for (const [key, value] of Object.entries(changes)) {
    if (typeof value === "string") {
      const resolvedValue = resolveTemplateField(value, context);
      if (resolvedValue !== undefined) {
        resolved[key] = resolvedValue;
      }
    } else if (value !== undefined && value !== null) {
      resolved[key] = String(value);
    }
  }
  return resolved;
}

/**
 * Context passed to resolveNode and condition evaluation
 */
export interface ResolveContext {
  user: User;
  submittedFields?: Record<string, string>;
}

/**
 * Evaluates a single condition against the current context
 */
function evaluateSingleCondition(
  condition: {
    operator?: string;
    field?: string;
    value?: string;
    operands?: Array<{ operator: string; operands: string[] }>;
  },
  context: ResolveContext,
): boolean {
  // Handle the operator at the condition level
  const operator = condition.operator?.toLowerCase();
  const field = condition.field
    ? resolveTemplateField(condition.field, context)
    : "";
  const value = condition.value || "";

  switch (operator) {
    case "exists":
      return field !== undefined && field !== null && field !== "";
    case "not_exists":
      return field === undefined || field === null || field === "";
    case "ends_with":
      return typeof field === "string" && field.endsWith(value);
    case "starts_with":
      return typeof field === "string" && field.startsWith(value);
    case "contains":
      return typeof field === "string" && field.includes(value);
    case "not_contains":
      return typeof field !== "string" || !field.includes(value);
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
              if (typeof resolvedField === "string" && resolvedField.endsWith(matchValue)) {
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
 * Evaluates a router condition against the current context
 * Supports both single conditions and compound conditions with AND logic
 */
function evaluateCondition(
  condition: {
    type?: string; // "and" for compound conditions
    conditions?: Array<{
      operator?: string;
      field?: string;
      value?: string;
    }>;
    operator?: string;
    field?: string;
    value?: string;
    operands?: Array<{ operator: string; operands: string[] }>;
  },
  context: ResolveContext,
): boolean {
  // Handle compound conditions with AND logic
  if (condition.type === "and" && Array.isArray(condition.conditions)) {
    // All conditions must be true (AND logic)
    return condition.conditions.every((cond) => evaluateSingleCondition(cond, context));
  }

  // Handle single condition (backward compatibility)
  return evaluateSingleCondition(condition, context);
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
    user_id?: string;
    connection_id?: string;
    changes?: Record<string, unknown>;
  };
}

/**
 * Flow fetcher function type for async flow resolution
 */
export type FlowFetcher = (flowId: string) => Promise<{
  actions?: FlowAction[];
} | null>;

/**
 * Pending user update action to be executed by the caller
 */
export interface PendingUserUpdate {
  user_id: string;
  connection_id?: string;
  changes: Record<string, string>;
}

/**
 * Builds userUpdates object from a PendingUserUpdate's changes map.
 * Handles dot-notation key prefixes:
 *  - "metadata.X" → user_metadata.X
 *  - "address.X"  → address.X  (nested OIDC address claim)
 *  - anything else → top-level user field
 */
export function buildUserUpdates(
  changes: Record<string, string>,
  existingUser: { user_metadata?: unknown; address?: unknown },
): Record<string, unknown> {
  const userUpdates: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(changes)) {
    if (key.startsWith("user_metadata.") || key.startsWith("metadata.")) {
      const metaKey = key.startsWith("user_metadata.")
        ? key.slice("user_metadata.".length)
        : key.slice("metadata.".length);
      const existingMetadata = (existingUser.user_metadata || {}) as Record<
        string,
        unknown
      >;
      userUpdates.user_metadata = {
        ...existingMetadata,
        ...((userUpdates.user_metadata as Record<string, unknown>) || {}),
        [metaKey]: value,
      };
    } else if (key.startsWith("address.")) {
      const addrKey = key.slice("address.".length);
      const existingAddr = (existingUser.address || {}) as Record<
        string,
        unknown
      >;
      userUpdates.address = {
        ...existingAddr,
        ...((userUpdates.address as Record<string, unknown>) || {}),
        [addrKey]: value,
      };
    } else {
      userUpdates[key] = value;
    }
  }

  return userUpdates;
}

/**
 * Merge multiple PendingUserUpdate entries by user_id so that overlapping
 * changes (e.g. two updates both touching metadata.*) are accumulated into
 * a single changes map per user.  This avoids the stale-snapshot problem
 * where each call to buildUserUpdates would spread the *original* user
 * object, causing later writes to overwrite earlier ones.
 */
export function mergeUserUpdates(
  updates: PendingUserUpdate[],
): PendingUserUpdate[] {
  const grouped = new Map<string, PendingUserUpdate>();
  for (const update of updates) {
    const existing = grouped.get(update.user_id);
    if (existing) {
      // Later values win for the same key, matching sequential semantics
      existing.changes = { ...existing.changes, ...update.changes };
    } else {
      grouped.set(update.user_id, {
        user_id: update.user_id,
        connection_id: update.connection_id,
        changes: { ...update.changes },
      });
    }
  }
  return Array.from(grouped.values());
}

/**
 * Result type for node resolution
 */
type ResolveNodeResult =
  | { type: "step"; nodeId: string; userUpdates?: PendingUserUpdate[] }
  | { type: "redirect"; target: string; customUrl?: string; userUpdates?: PendingUserUpdate[] }
  | { type: "end"; userUpdates?: PendingUserUpdate[] }
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
  context: ResolveContext,
  flowFetcher?: FlowFetcher,
  maxDepth = 10,
): Promise<ResolveNodeResult> {
  let currentNodeId = startNodeId;
  let depth = 0;
  const pendingUserUpdates: PendingUserUpdate[] = [];

  while (depth < maxDepth) {
    // Check for ending
    if (currentNodeId === "$ending") {
      return { type: "end", userUpdates: pendingUserUpdates.length > 0 ? pendingUserUpdates : undefined };
    }

    const node = nodes.find((n) => n.id === currentNodeId);
    if (!node) {
      return null;
    }

    // If it's a STEP node, we found our target
    if (node.type === "STEP") {
      return { type: "step", nodeId: node.id, userUpdates: pendingUserUpdates.length > 0 ? pendingUserUpdates : undefined };
    }

    // If it's an ACTION node with REDIRECT, return redirect info
    if (node.type === "ACTION") {
      const actionNode = node as unknown as ActionNode;
      if (actionNode.config.action_type === "REDIRECT") {
        return {
          type: "redirect",
          target: actionNode.config.target,
          customUrl: actionNode.config.custom_url,
          userUpdates: pendingUserUpdates.length > 0 ? pendingUserUpdates : undefined,
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
          for (const action of flow.actions) {
            // Handle REDIRECT_USER action
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
                  userUpdates: pendingUserUpdates.length > 0 ? pendingUserUpdates : undefined,
                };
              }
            }

            // Handle AUTH0 UPDATE_USER action
            if (
              action.type === "AUTH0" &&
              action.action === "UPDATE_USER" &&
              action.params
            ) {
              const userId = action.params.user_id
                ? resolveTemplateField(action.params.user_id, context) || context.user.user_id
                : context.user.user_id;
              const changes = action.params.changes
                ? resolveTemplateValues(action.params.changes, context)
                : {};

              if (Object.keys(changes).length > 0) {
                pendingUserUpdates.push({
                  user_id: userId,
                  connection_id: action.params.connection_id,
                  changes,
                });
              }
            }
          }
        }
      }
      // Continue to next node
      if (flowNode.config.next_node) {
        currentNodeId = flowNode.config.next_node;
        depth++;
        continue;
      }
      // No next_node configured, treat as end
      return { type: "end", userUpdates: pendingUserUpdates.length > 0 ? pendingUserUpdates : undefined };
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
  client?: EnrichedClient,
): Promise<User | Response> {
  const data = ctx.env.data;
  const tenant_id = ctx.var.tenant_id || ctx.req.header("tenant-id");
  if (!tenant_id) {
    throw new HTTPException(400, { message: "Missing tenant_id in context" });
  }
  
  // Determine route prefix based on client's universal_login_version
  const routePrefix =
    client?.client_metadata?.universal_login_version === "2" ? "/u2" : "/u";
    
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
      return {
        actions: flow.actions?.map((action) => ({
          type: action.type,
          action: action.action,
          params: "params" in action && action.params ? action.params as Record<string, unknown> : undefined,
        })),
      };
    };

    const result = await resolveNode(
      form.nodes,
      firstNodeId,
      { user },
      flowFetcher,
    );

    // Apply any pending user updates accumulated during node resolution
    if (result && result.userUpdates && result.userUpdates.length > 0) {
      const merged = mergeUserUpdates(result.userUpdates);
      for (const update of merged) {
        const userUpdates = buildUserUpdates(update.changes, user);
        await data.users.update(tenant_id, update.user_id, userUpdates);
      }
    }

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
        // Return URL uses the same route prefix to resume the login flow
        const returnUrl = `${routePrefix}/continue?state=${encodeURIComponent(loginSession.id)}`;
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
  let url = `${routePrefix}/forms/${form.id}/nodes/${firstNodeId}?state=${encodeURIComponent(
    loginSession.id,
  )}`;

  return new Response(null, {
    status: 302,
    headers: { location: url },
  });
}
