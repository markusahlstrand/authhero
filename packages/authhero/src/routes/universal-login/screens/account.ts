/**
 * Account screen - main hub for account management
 *
 * Corresponds to: /u2/account
 */

import type { UiScreen, FormNodeComponent } from "@authhero/adapter-interfaces";
import type { ScreenContext, ScreenResult, ScreenDefinition } from "./types";
import { resolveAccountUser } from "./account-helpers";
import { escapeHtml } from "../sanitization-utils";
import { PASSKEY_TYPES } from "./passkey-utils";

/**
 * Create the account hub screen
 */
export async function accountScreen(
  context: ScreenContext,
): Promise<ScreenResult> {
  const {
    ctx,
    tenant,
    branding,
    state,
    routePrefix = "/u2",
    messages,
  } = context;

  const { user } = await resolveAccountUser(context);

  // Fetch enrollments and separate MFA from passkeys
  let mfaCount = 0;
  let passkeyCount = 0;
  try {
    const enrollments = await ctx.env.data.authenticationMethods.list(
      tenant.id,
      user.user_id,
    );
    const confirmed = enrollments.filter((e) => e.confirmed);
    passkeyCount = confirmed.filter((e) =>
      PASSKEY_TYPES.includes(e.type as (typeof PASSKEY_TYPES)[number]),
    ).length;
    mfaCount = confirmed.filter(
      (e) =>
        !PASSKEY_TYPES.includes(e.type as (typeof PASSKEY_TYPES)[number]),
    ).length;
  } catch {
    // MFA adapter may not exist
  }

  // Check if any connection has passkeys enabled
  const hasPasskeysEnabled = context.connections.some(
    (c) => c.options?.authentication_methods?.passkey?.enabled,
  );

  // Count linked identities (non-primary)
  const linkedIdentities =
    user.identities?.filter(
      (identity) =>
        !(
          identity.provider === user.provider &&
          identity.user_id === user.user_id.split("|")[1]
        ),
    ) || [];

  const stateParam = encodeURIComponent(state);

  const components: FormNodeComponent[] = [
    // User info section
    {
      id: "user-info",
      type: "RICH_TEXT",
      category: "BLOCK",
      visible: true,
      config: {
        content: `
          <div style="display:flex;flex-direction:column;gap:16px">
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
              ${
                user.picture
                  ? `<img src="${escapeHtml(user.picture)}" alt="" style="width:48px;height:48px;border-radius:50%;object-fit:cover" />`
                  : `<div style="width:48px;height:48px;border-radius:50%;background:#e5e7eb;display:flex;align-items:center;justify-content:center;font-size:20px;color:#6b7280">${escapeHtml((user.name || user.email || "?")[0]!.toUpperCase())}</div>`
              }
              <div>
                <div style="font-weight:600;font-size:16px">${escapeHtml(user.name || user.given_name || user.nickname || "")}</div>
                <div style="color:#6b7280;font-size:14px">${escapeHtml(user.email || "")}</div>
              </div>
            </div>
            <hr style="border:none;border-top:1px solid #e5e7eb" />
            <div style="display:flex;flex-direction:column;gap:4px">
              <div style="font-size:13px;color:#6b7280">Phone</div>
              <div style="font-size:14px">${user.phone_number ? escapeHtml(user.phone_number) : '<span style="color:#9ca3af">Not set</span>'}</div>
            </div>
          </div>
        `,
      },
      order: 0,
    },
  ];

  const links: Array<{ id: string; text: string; href: string }> = [
    {
      id: "edit-profile",
      text: "Edit Profile",
      href: `${routePrefix}/account/profile?state=${stateParam}`,
    },
    {
      id: "security-settings",
      text: `Security Settings${mfaCount > 0 ? ` (${mfaCount} method${mfaCount !== 1 ? "s" : ""})` : ""}`,
      href: `${routePrefix}/account/security?state=${stateParam}`,
    },
  ];

  if (hasPasskeysEnabled) {
    links.push({
      id: "passkeys",
      text: `Passkeys${passkeyCount > 0 ? ` (${passkeyCount})` : ""}`,
      href: `${routePrefix}/account/passkeys?state=${stateParam}`,
    });
  }

  links.push(
    {
      id: "linked-accounts",
      text: `Linked Accounts${linkedIdentities.length > 0 ? ` (${linkedIdentities.length})` : ""}`,
      href: `${routePrefix}/account/linked?state=${stateParam}`,
    },
    {
      id: "delete-account",
      text: "Delete Account",
      href: `${routePrefix}/account/delete?state=${stateParam}`,
    },
  );

  const screen: UiScreen = {
    name: "account",
    action: `${routePrefix}/account?state=${stateParam}`,
    method: "POST",
    title: "Account Settings",
    description: "Manage your account",
    components,
    links,
    messages,
  };

  return { screen, branding };
}

/**
 * Screen definition for the account hub screen
 */
export const accountScreenDefinition: ScreenDefinition = {
  id: "account",
  name: "Account",
  description: "Main account management hub",
  handler: {
    get: accountScreen,
  },
};
