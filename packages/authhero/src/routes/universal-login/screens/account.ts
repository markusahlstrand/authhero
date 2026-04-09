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
    client,
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

  // Build logout URL
  const loginSession = await ctx.env.data.loginSessions.get(tenant.id, state);
  const returnTo =
    loginSession?.authParams?.redirect_uri || loginSession?.authorization_url;
  const logoutParams = new URLSearchParams({
    client_id: client.client_id,
  });
  if (returnTo) {
    logoutParams.set("returnTo", returnTo);
  }
  const logoutUrl = `/v2/logout?${logoutParams.toString()}`;

  // Build navigation links HTML
  const navItems: Array<{
    href: string;
    label: string;
    detail?: string;
  }> = [
    {
      href: `${routePrefix}/account/profile?state=${stateParam}`,
      label: "Edit Profile",
      detail: "Name, email, phone number, and picture",
    },
    {
      href: `${routePrefix}/account/security?state=${stateParam}`,
      label: "Security Settings",
      detail: mfaCount > 0
        ? `${mfaCount} method${mfaCount !== 1 ? "s" : ""} configured`
        : "Multi-factor authentication",
    },
  ];

  if (hasPasskeysEnabled) {
    navItems.push({
      href: `${routePrefix}/account/passkeys?state=${stateParam}`,
      label: "Passkeys",
      detail: passkeyCount > 0
        ? `${passkeyCount} passkey${passkeyCount !== 1 ? "s" : ""} registered`
        : "Sign in without a password",
    });
  }

  navItems.push({
    href: `${routePrefix}/account/linked?state=${stateParam}`,
    label: "Linked Accounts",
    detail: linkedIdentities.length > 0
      ? `${linkedIdentities.length} linked account${linkedIdentities.length !== 1 ? "s" : ""}`
      : "Connect social accounts",
  });

  const navLinksHtml = navItems
    .map(
      (item) => `
        <a href="${escapeHtml(item.href)}" style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border:1px solid #e5e7eb;border-radius:8px;text-decoration:none;color:inherit;transition:background 0.15s">
          <div>
            <div style="font-weight:500;font-size:14px">${escapeHtml(item.label)}</div>
            ${item.detail ? `<div style="font-size:13px;color:#6b7280;margin-top:2px">${escapeHtml(item.detail)}</div>` : ""}
          </div>
          <div style="color:#9ca3af;font-size:18px">&#8250;</div>
        </a>`,
    )
    .join("");

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
            <div style="display:flex;align-items:center;gap:12px">
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
          </div>
        `,
      },
      order: 0,
    },
    // Navigation links section
    {
      id: "nav-links",
      type: "RICH_TEXT",
      category: "BLOCK",
      visible: true,
      config: {
        content: `<div style="display:flex;flex-direction:column;gap:8px">${navLinksHtml}</div>`,
      },
      order: 1,
    },
    // Danger zone
    {
      id: "danger-zone",
      type: "RICH_TEXT",
      category: "BLOCK",
      visible: true,
      config: {
        content: `
          <div style="display:flex;flex-direction:column;gap:8px;margin-top:8px;padding-top:16px;border-top:1px solid #e5e7eb">
            <a href="${escapeHtml(`${routePrefix}/account/delete?state=${stateParam}`)}" style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border:1px solid #fecaca;border-radius:8px;text-decoration:none;color:#dc2626;transition:background 0.15s">
              <div>
                <div style="font-weight:500;font-size:14px">Delete Account</div>
                <div style="font-size:13px;color:#ef4444;margin-top:2px">Permanently delete your account and data</div>
              </div>
              <div style="font-size:18px">&#8250;</div>
            </a>
          </div>
        `,
      },
      order: 2,
    },
  ];

  const screen: UiScreen = {
    name: "account",
    action: `${routePrefix}/account?state=${stateParam}`,
    method: "POST",
    title: "Account Settings",
    description: "Manage your account",
    components,
    links: [
      {
        id: "logout",
        text: "Log Out",
        href: logoutUrl,
      },
    ],
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
