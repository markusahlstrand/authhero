/**
 * Account Security screen - manage MFA enrollments
 *
 * Corresponds to: /u2/account/security
 */

import type { UiScreen, FormNodeComponent } from "@authhero/adapter-interfaces";
import type { ScreenContext, ScreenResult, ScreenDefinition } from "./types";
import { resolveAccountUser } from "./account-helpers";
import { escapeHtml } from "../sanitization-utils";
import { PASSKEY_TYPES } from "./passkey-utils";
import { createTranslation } from "../../../i18n";

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
  const { m } = createTranslation(
    "common",
    "account-security",
    context.language || "en",
    context.customText,
  );
  const stateParam = encodeURIComponent(state);

  const mfaTypeLabels: Record<string, string> = {
    totp: m.typeTotp(),
    phone: m.typePhone(),
    email: m.typeEmail(),
    push: m.typePush(),
    webauthn: m.typeWebauthn(),
  };

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
      await ctx.env.data.authenticationMethods.list(tenant.id, user.user_id)
    ).filter(
      (e) =>
        e.confirmed &&
        !PASSKEY_TYPES.includes(e.type as (typeof PASSKEY_TYPES)[number]),
    );
  } catch {
    // MFA adapter may not exist
  }

  const components: FormNodeComponent[] = [];

  // Build enrollment list HTML
  if (enrollments.length === 0) {
    components.push({
      id: "no-enrollments",
      type: "RICH_TEXT",
      category: "BLOCK",
      visible: true,
      config: {
        content: `<p style='color:#6b7280'>${escapeHtml(m.noEnrollments())}</p>`,
      },
      order: 0,
    });
  } else {
    const enrollmentHtml = enrollments
      .map((enrollment) => {
        const typeLabel = mfaTypeLabels[enrollment.type] || enrollment.type;
        const detail = enrollment.phone_number
          ? ` (${escapeHtml(enrollment.phone_number)})`
          : "";
        const createdAt = enrollment.created_at
          ? new Date(enrollment.created_at).toLocaleDateString(
              context.language || "en",
            )
          : "";

        return `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border:1px solid #e5e7eb;border-radius:8px">
            <div>
              <div style="font-weight:500;font-size:14px">${escapeHtml(typeLabel)}${detail}</div>
              ${createdAt ? `<div style="font-size:13px;color:#9ca3af;margin-top:2px">${escapeHtml(m.addedOn({ date: createdAt }))}</div>` : ""}
            </div>
            <button type="submit" name="action" value="remove_enrollment" data-enrollment-id="${escapeHtml(enrollment.id)}" style="background:none;border:1px solid #fecaca;border-radius:6px;padding:4px 10px;font-size:13px;cursor:pointer;color:#dc2626" onclick="handleRemoveEnrollment(this)">${escapeHtml(m.removeButtonText())}</button>
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
        content: `<div style="display:flex;flex-direction:column;gap:8px">${enrollmentHtml}</div>`,
      },
      order: 0,
    });

    // Hidden fields for remove action
    components.push({
      id: "enrollment_id",
      type: "TEXT",
      category: "FIELD",
      visible: false,
      config: {},
      required: false,
      order: 1,
    });
  }

  // Build "Add method" links based on tenant MFA factor config
  const addLinks: string[] = [];
  const hasTotp = tenant.mfa?.factors?.otp === true;
  const hasSms = tenant.mfa?.factors?.sms === true;
  const hasExistingTotp = enrollments.some((e) => e.type === "totp");

  if (hasTotp && !hasExistingTotp) {
    addLinks.push(
      `<a href="${routePrefix}/account/security/totp-enrollment?state=${stateParam}" style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border:1px solid #d1d5db;border-radius:8px;text-decoration:none;color:inherit;transition:background 0.15s">
        <div>
          <div style="font-weight:500;font-size:14px">${escapeHtml(m.addTotpLabel())}</div>
          <div style="font-size:13px;color:#6b7280;margin-top:2px">${escapeHtml(m.addTotpDetail())}</div>
        </div>
        <div style="color:#9ca3af;font-size:18px">&#8250;</div>
      </a>`,
    );
  }

  if (hasSms) {
    addLinks.push(
      `<a href="${routePrefix}/account/security/phone-enrollment?state=${stateParam}" style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border:1px solid #d1d5db;border-radius:8px;text-decoration:none;color:inherit;transition:background 0.15s">
        <div>
          <div style="font-weight:500;font-size:14px">${escapeHtml(m.addSmsLabel())}</div>
          <div style="font-size:13px;color:#6b7280;margin-top:2px">${escapeHtml(m.addSmsDetail())}</div>
        </div>
        <div style="color:#9ca3af;font-size:18px">&#8250;</div>
      </a>`,
    );
  }

  if (addLinks.length > 0) {
    components.push({
      id: "add-methods",
      type: "RICH_TEXT",
      category: "BLOCK",
      visible: true,
      config: {
        content: `<div style="display:flex;flex-direction:column;gap:8px;margin-top:8px;padding-top:16px;border-top:1px solid #e5e7eb">${addLinks.join("")}</div>`,
      },
      order: 2,
    });
  }

  const screen: UiScreen = {
    name: "account-security",
    action: `${routePrefix}/account/security?state=${stateParam}`,
    method: "POST",
    title: m.title(),
    description: m.description(),
    components,
    links: [
      {
        id: "back-to-account",
        text: m.backToAccountText(),
        href: `${routePrefix}/account?state=${stateParam}`,
      },
    ],
    messages,
  };

  const extraScript =
    enrollments.length > 0
      ? `function handleRemoveEnrollment(btn) {
  var f = btn.closest('form');
  if (!f) {
    var w = document.querySelector('authhero-widget');
    if (w && w.shadowRoot) f = w.shadowRoot.querySelector('form');
  }
  if (f) {
    var input = f.querySelector('[name="enrollment_id"]');
    if (input) input.value = btn.getAttribute('data-enrollment-id');
  }
}`
      : undefined;

  return { screen, branding, extraScript };
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
  const { m } = createTranslation(
    "common",
    "account-security",
    context.language || "en",
    context.customText,
  );

  const action = data.action as string;
  const enrollmentId = data.enrollment_id as string;

  if (action === "remove_enrollment" && enrollmentId) {
    try {
      // Verify the enrollment belongs to this user
      const enrollment = await ctx.env.data.authenticationMethods.get(
        tenant.id,
        enrollmentId,
      );
      if (!enrollment || enrollment.user_id !== user.user_id) {
        return {
          error: m.enrollmentNotFound(),
          screen: await accountSecurityScreen({
            ...context,
            messages: [{ text: m.enrollmentNotFound(), type: "error" }],
          }),
        };
      }

      await ctx.env.data.authenticationMethods.remove(tenant.id, enrollmentId);

      return {
        screen: await accountSecurityScreen({
          ...context,
          messages: [
            {
              text: m.removeSuccess(),
              type: "success",
            },
          ],
        }),
      };
    } catch {
      return {
        error: m.removeFailed(),
        screen: await accountSecurityScreen({
          ...context,
          messages: [
            {
              text: m.removeFailed(),
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
