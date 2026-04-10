/**
 * Account Linked screen - manage linked identities
 *
 * Corresponds to: /u2/account/linked
 */

import type { UiScreen, FormNodeComponent } from "@authhero/adapter-interfaces";
import type { ScreenContext, ScreenResult, ScreenDefinition } from "./types";
import { resolveAccountUser } from "./account-helpers";
import { escapeHtml } from "../sanitization-utils";

const PROVIDER_LABELS: Record<string, string> = {
  "google-oauth2": "Google",
  github: "GitHub",
  facebook: "Facebook",
  apple: "Apple",
  microsoft: "Microsoft",
  linkedin: "LinkedIn",
  twitter: "Twitter",
};

/**
 * Create the account-linked screen
 */
export async function accountLinkedScreen(
  context: ScreenContext,
): Promise<ScreenResult> {
  const { branding, state, routePrefix = "/u2" } = context;
  let { messages } = context;

  const { user } = await resolveAccountUser(context);
  const stateParam = encodeURIComponent(state);

  // Filter to non-primary identities
  const linkedIdentities =
    user.identities?.filter(
      (identity) =>
        !(
          identity.provider === user.provider &&
          identity.user_id === user.user_id.split("|")[1]
        ),
    ) || [];

  const components: FormNodeComponent[] = [];

  if (linkedIdentities.length === 0) {
    components.push({
      id: "no-linked",
      type: "RICH_TEXT",
      category: "BLOCK",
      visible: true,
      config: {
        content: "<p style='color:#6b7280'>No linked accounts.</p>",
      },
      order: 0,
    });
  } else {
    // Build HTML list of linked identities with unlink buttons
    const identitiesHtml = linkedIdentities
      .map((identity) => {
        const providerLabel =
          PROVIDER_LABELS[identity.provider] || identity.provider;
        const email = identity.profileData?.email || identity.user_id;
        return `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid #e5e7eb">
            <div>
              <div style="font-size:13px;color:#6b7280">${escapeHtml(providerLabel)}</div>
              <div style="font-weight:500">${escapeHtml(email)}</div>
            </div>
            <button type="submit" name="action" value="unlink_account:${escapeHtml(identity.provider)}:${escapeHtml(identity.user_id)}" style="padding:6px 16px;font-size:13px;color:#dc2626;border:1px solid #dc2626;border-radius:6px;background:transparent;cursor:pointer;white-space:nowrap">Unlink</button>
          </div>
        `;
      })
      .join("");

    components.push({
      id: "linked-list",
      type: "RICH_TEXT",
      category: "BLOCK",
      visible: true,
      config: {
        content: `<div>${identitiesHtml}</div>`,
      },
      order: 0,
    });
  }

  const screen: UiScreen = {
    name: "account-linked",
    action: `${routePrefix}/account/linked?state=${stateParam}`,
    method: "POST",
    title: "Linked Accounts",
    description: "Manage your linked accounts",
    components,
    links: [
      {
        id: "back-to-account",
        text: "Back to Account",
        href: `${routePrefix}/account?state=${stateParam}`,
      },
    ],
    messages,
  };

  return { screen, branding };
}

/**
 * Handle account-linked form submission
 */
async function handleAccountLinkedSubmit(
  context: ScreenContext,
  data: Record<string, unknown>,
): Promise<
  | { screen: ScreenResult }
  | { redirect: string; cookies?: string[] }
  | { error: string; screen: ScreenResult }
  | { response: Response }
> {
  const { ctx, tenant } = context;

  const { user } = await resolveAccountUser(context);

  const action = data.action as string;

  // Parse composite action value: "unlink_account:provider:user_id"
  const unlinkMatch = action?.match(/^unlink_account:(.+?):(.+)$/);
  if (unlinkMatch) {
    const provider = unlinkMatch[1]!;
    const linkedUserId = unlinkMatch[2]!;
    try {
      const success = await ctx.env.data.users.unlink(
        tenant.id,
        user.user_id,
        provider,
        linkedUserId,
      );

      if (success) {
        return {
          screen: await accountLinkedScreen({
            ...context,
            messages: [
              { text: "Account unlinked successfully", type: "success" },
            ],
          }),
        };
      }

      return {
        error: "Failed to unlink account",
        screen: await accountLinkedScreen({
          ...context,
          messages: [{ text: "Failed to unlink account", type: "error" }],
        }),
      };
    } catch {
      return {
        error: "Failed to unlink account",
        screen: await accountLinkedScreen({
          ...context,
          messages: [{ text: "Failed to unlink account", type: "error" }],
        }),
      };
    }
  }

  return {
    screen: await accountLinkedScreen(context),
  };
}

/**
 * Screen definition for the account-linked screen
 */
export const accountLinkedScreenDefinition: ScreenDefinition = {
  id: "account-linked",
  name: "Account Linked",
  description: "Manage linked accounts",
  handler: {
    get: accountLinkedScreen,
    post: handleAccountLinkedSubmit,
  },
};
