/**
 * Account Delete screen - confirm and delete account
 *
 * Corresponds to: /u2/account/delete
 */

import type { UiScreen, FormNodeComponent } from "@authhero/adapter-interfaces";
import type { ScreenContext, ScreenResult, ScreenDefinition } from "./types";
import { resolveAccountUser } from "./account-helpers";
import { createTranslation } from "../../../i18n";
import { escapeHtml } from "../sanitization-utils";

// The literal word users must type; intentionally not localized.
const CONFIRMATION_WORD = "DELETE";

/**
 * Create the account-delete screen
 */
export async function accountDeleteScreen(
  context: ScreenContext,
): Promise<ScreenResult> {
  const { branding, state, errors, messages, routePrefix = "/u2" } = context;

  await resolveAccountUser(context);
  const { m } = createTranslation(
    "common",
    "account-delete",
    context.language || "en",
    context.customText,
  );
  const stateParam = encodeURIComponent(state);

  const components: FormNodeComponent[] = [
    {
      id: "warning",
      type: "RICH_TEXT",
      category: "BLOCK",
      visible: true,
      config: {
        content: `
          <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;margin-bottom:8px">
            <p style="color:#dc2626;font-weight:600;margin-bottom:8px">${escapeHtml(m.warningTitle())}</p>
            <p style="color:#7f1d1d;font-size:14px">${escapeHtml(m.warningText())}</p>
          </div>
        `,
      },
      order: 0,
    },
    {
      id: "confirmation",
      type: "TEXT",
      category: "FIELD",
      visible: true,
      label: m.confirmationLabel({ confirmationWord: CONFIRMATION_WORD }),
      config: {
        placeholder: CONFIRMATION_WORD,
      },
      required: true,
      order: 1,
      messages: errors?.confirmation
        ? [{ text: errors.confirmation, type: "error" as const }]
        : undefined,
    },
    {
      id: "submit",
      type: "NEXT_BUTTON",
      category: "BLOCK",
      visible: true,
      config: {
        text: m.buttonText(),
      },
      order: 2,
    },
  ];

  const screen: UiScreen = {
    name: "account-delete",
    action: `${routePrefix}/account/delete?state=${stateParam}`,
    method: "POST",
    title: m.title(),
    description: m.description(),
    components,
    links: [
      {
        id: "cancel",
        text: m.cancelText(),
        href: `${routePrefix}/account?state=${stateParam}`,
      },
    ],
    messages,
  };

  return { screen, branding };
}

/**
 * Handle account-delete form submission
 */
async function handleAccountDeleteSubmit(
  context: ScreenContext,
  data: Record<string, unknown>,
): Promise<
  | { screen: ScreenResult }
  | { redirect: string; cookies?: string[] }
  | { error: string; screen: ScreenResult }
  | { response: Response }
> {
  const { ctx, tenant, state } = context;

  const { user, session } = await resolveAccountUser(context);
  const { m } = createTranslation(
    "common",
    "account-delete",
    context.language || "en",
    context.customText,
  );

  const confirmation = (data.confirmation as string)?.trim();

  if (confirmation !== CONFIRMATION_WORD) {
    const confirmationError = m.confirmationError({
      confirmationWord: CONFIRMATION_WORD,
    });
    return {
      error: confirmationError,
      screen: await accountDeleteScreen({
        ...context,
        errors: { confirmation: confirmationError },
      }),
    };
  }

  try {
    // Revoke the session
    await ctx.env.data.sessions.update(tenant.id, session.id, {
      revoked_at: new Date().toISOString(),
    });

    // Delete the user
    await ctx.env.data.users.remove(tenant.id, user.user_id);

    // Get login session for redirect
    const loginSession = await ctx.env.data.loginSessions.get(tenant.id, state);
    const redirectUri =
      loginSession?.authParams?.redirect_uri || loginSession?.authorization_url;

    if (redirectUri) {
      return { redirect: redirectUri };
    }

    // No redirect URI available, show success message
    return {
      screen: await accountDeleteScreen({
        ...context,
        messages: [
          {
            text: m.deleteSuccess(),
            type: "success",
          },
        ],
      }),
    };
  } catch {
    return {
      error: m.deleteFailed(),
      screen: await accountDeleteScreen({
        ...context,
        messages: [{ text: m.deleteFailed(), type: "error" }],
      }),
    };
  }
}

/**
 * Screen definition for the account-delete screen
 */
export const accountDeleteScreenDefinition: ScreenDefinition = {
  id: "account-delete",
  name: "Account Delete",
  description: "Delete account confirmation",
  handler: {
    get: accountDeleteScreen,
    post: handleAccountDeleteSubmit,
  },
};
