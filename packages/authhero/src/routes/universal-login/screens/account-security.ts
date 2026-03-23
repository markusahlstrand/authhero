/**
 * Account Security screen - manage MFA enrollments
 *
 * Corresponds to: /u2/account/security
 */

import type { UiScreen, FormNodeComponent } from "@authhero/adapter-interfaces";
import type { ScreenContext, ScreenResult, ScreenDefinition } from "./types";
import { resolveAccountUser } from "./account-helpers";
import { escapeHtml } from "../sanitization-utils";

const MFA_TYPE_LABELS: Record<string, string> = {
  totp: "Authenticator App",
  phone: "Phone (SMS)",
  email: "Email",
  push: "Push Notification",
  webauthn: "Security Key",
};

/**
 * Create the account-security screen
 */
export async function accountSecurityScreen(
  context: ScreenContext,
): Promise<ScreenResult> {
  const {
    ctx,
    tenant,
    branding,
    state,
    messages,
    routePrefix = "/u2",
  } = context;

  const { user } = await resolveAccountUser(context);
  const stateParam = encodeURIComponent(state);

  // Fetch MFA enrollments
  let enrollments: Array<{
    id: string;
    type: string;
    confirmed?: boolean;
    phone_number?: string;
    created_at?: string;
  }> = [];
  try {
    enrollments = (
      await ctx.env.data.mfaEnrollments.list(tenant.id, user.user_id)
    ).filter((e) => e.confirmed);
  } catch {
    // MFA adapter may not exist
  }

  const components: FormNodeComponent[] = [];

  if (enrollments.length === 0) {
    components.push({
      id: "no-enrollments",
      type: "RICH_TEXT",
      category: "BLOCK",
      visible: true,
      config: {
        content:
          "<p style='color:#6b7280'>You have no two-factor authentication methods configured.</p>",
      },
      order: 0,
    });
  } else {
    // Build HTML list of enrollments with remove buttons
    const enrollmentHtml = enrollments
      .map((enrollment) => {
        const typeLabel = MFA_TYPE_LABELS[enrollment.type] || enrollment.type;
        const detail = enrollment.phone_number
          ? ` (${escapeHtml(enrollment.phone_number)})`
          : "";
        const createdAt = enrollment.created_at
          ? new Date(enrollment.created_at).toLocaleDateString()
          : "";

        return `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid #e5e7eb">
            <div>
              <div style="font-weight:500">${escapeHtml(typeLabel)}${detail}</div>
              ${createdAt ? `<div style="font-size:12px;color:#9ca3af">Added ${escapeHtml(createdAt)}</div>` : ""}
            </div>
          </div>
        `;
      })
      .join("");

    components.push({
      id: "enrollments",
      type: "RICH_TEXT",
      category: "BLOCK",
      visible: true,
      config: {
        content: `<div>${enrollmentHtml}</div>`,
      },
      order: 0,
    });

    // Add a hidden field for enrollment_id and action, plus a select to pick which one to remove
    components.push(
      {
        id: "action",
        type: "TEXT",
        category: "FIELD",
        visible: false,
        config: {
          default_value: "remove_enrollment",
        },
        required: false,
        order: 1,
      },
      {
        id: "enrollment_id",
        type: "TEXT",
        category: "FIELD",
        visible: true,
        label: "Enrollment ID to remove",
        config: {
          placeholder: "Select an enrollment to remove",
        },
        required: true,
        order: 2,
      },
      {
        id: "submit",
        type: "NEXT_BUTTON",
        category: "BLOCK",
        visible: true,
        config: {
          text: "Remove Selected Method",
        },
        order: 3,
      },
    );
  }

  const screen: UiScreen = {
    name: "account-security",
    action: `${routePrefix}/account/security?state=${stateParam}`,
    method: "POST",
    title: "Security Settings",
    description: "Manage your two-factor authentication methods",
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
 * Handle account-security form submission
 */
async function handleAccountSecuritySubmit(
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
  const enrollmentId = data.enrollment_id as string;

  if (action === "remove_enrollment" && enrollmentId) {
    try {
      // Verify the enrollment belongs to this user
      const enrollment = await ctx.env.data.mfaEnrollments.get(
        tenant.id,
        enrollmentId,
      );
      if (!enrollment || enrollment.user_id !== user.user_id) {
        return {
          error: "Enrollment not found",
          screen: await accountSecurityScreen({
            ...context,
            messages: [{ text: "Enrollment not found", type: "error" }],
          }),
        };
      }

      await ctx.env.data.mfaEnrollments.remove(tenant.id, enrollmentId);

      return {
        screen: await accountSecurityScreen({
          ...context,
          messages: [
            {
              text: "Authentication method removed",
              type: "success",
            },
          ],
        }),
      };
    } catch {
      return {
        error: "Failed to remove authentication method",
        screen: await accountSecurityScreen({
          ...context,
          messages: [
            {
              text: "Failed to remove authentication method",
              type: "error",
            },
          ],
        }),
      };
    }
  }

  return {
    screen: await accountSecurityScreen(context),
  };
}

/**
 * Screen definition for the account-security screen
 */
export const accountSecurityScreenDefinition: ScreenDefinition = {
  id: "account-security",
  name: "Account Security",
  description: "Manage two-factor authentication methods",
  handler: {
    get: accountSecurityScreen,
    post: handleAccountSecuritySubmit,
  },
};
