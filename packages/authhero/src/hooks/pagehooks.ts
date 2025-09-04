import { Context } from "hono";
import { Bindings, Variables } from "../types";
import { LoginSession, User } from "@authhero/adapter-interfaces";
import { HTTPException } from "hono/http-exception";

// Type guard for page hooks
export function isPageHook(
  hook: any,
): hook is { page_id: string; enabled: boolean; permission_required?: string } {
  return typeof hook.page_id === "string" && typeof hook.enabled === "boolean";
}

/**
 * Handles a page hook: checks if user has required permission and returns a redirect Response to the page.
 * If user doesn't have the required permission, returns the user without redirect.
 */
export async function handlePageHook(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  page_id: string,
  loginSession: LoginSession,
  user: User,
  permission_required?: string,
): Promise<User | Response> {
  const data = ctx.env.data;
  const tenant_id = ctx.var.tenant_id || ctx.req.header("tenant-id");
  if (!tenant_id) {
    throw new HTTPException(400, { message: "Missing tenant_id in context" });
  }

  // Check if permission is required
  if (permission_required) {
    // Get user permissions
    const userPermissions = await data.userPermissions.list(
      tenant_id,
      user.user_id,
    );
    const hasPermission = userPermissions.some(
      (perm) => perm.permission_name === permission_required,
    );

    if (!hasPermission) {
      // User doesn't have required permission, return user without redirect
      return user;
    }
  }

  // If user has permission or no permission is required, redirect to the page
  let url = `/u/${page_id}?state=${encodeURIComponent(loginSession.id)}`;

  return new Response(null, {
    status: 302,
    headers: { location: url },
  });
}
