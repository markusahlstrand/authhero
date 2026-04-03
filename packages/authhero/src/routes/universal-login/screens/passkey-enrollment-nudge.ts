/**
 * Passkey Enrollment Nudge screen
 *
 * Shown after login when progressive enrollment is enabled and the user
 * has no passkeys registered. Offers three choices:
 *   - "Set up passkey" → proceeds to the enrollment ceremony
 *   - "Maybe later"    → snoozes the prompt for 30 days
 *   - "Don't show again" → permanently opts out
 *
 * Client-side: if the browser doesn't support WebAuthn
 * (window.PublicKeyCredential is undefined), the screen auto-submits
 * with action_no_webauthn so the login flow is never blocked.
 *
 * Corresponds to: /u2/passkey/enrollment-nudge
 */

import type { UiScreen, FormNodeComponent } from "@authhero/adapter-interfaces";
import type { ScreenContext, ScreenResult, ScreenDefinition } from "./types";
import { createTranslation } from "../../../i18n";
import {
  createFrontChannelAuthResponse,
  completeLoginSessionContinuation,
  hasValidContinuationScope,
} from "../../../authentication-flows/common";

async function passkeyEnrollmentNudgeScreen(
  context: ScreenContext,
): Promise<ScreenResult> {
  const { branding, state } = context;

  const locale = context.language || "en";
  const { m } = createTranslation(
    "passkeys",
    "passkey-enrollment-nudge",
    locale,
    context.customText,
  );

  const components: FormNodeComponent[] = [
    // WebAuthn capability check — auto-submits if not supported
    {
      id: "webauthn_check",
      type: "RICH_TEXT" as const,
      category: "BLOCK" as const,
      visible: true,
      config: {
        content: `<script>
(function(){
  if(typeof window!=='undefined'&&!window.PublicKeyCredential){
    var f=document.querySelector('form');
    if(f){
      var i=document.createElement('input');
      i.type='hidden';i.name='action_no_webauthn';i.value='1';
      f.appendChild(i);f.submit();
    }
  }
})();
</script>`,
      },
      order: 0,
    },
    // Passkey icon
    {
      id: "passkey_icon",
      type: "RICH_TEXT" as const,
      category: "BLOCK" as const,
      visible: true,
      config: {
        content: `<div style="display:flex;justify-content:center;margin-bottom:8px">
<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01"/><path d="M18 12h.01"/></svg>
</div>`,
      },
      order: 1,
    },
    // "Set up passkey" button
    {
      id: "action_enroll",
      type: "NEXT_BUTTON" as const,
      category: "BLOCK" as const,
      visible: true,
      config: {
        text: m.enrollButtonText(),
      },
      order: 2,
    },
    // "Maybe later" button
    {
      id: "action_snooze",
      type: "NEXT_BUTTON" as const,
      category: "BLOCK" as const,
      visible: true,
      config: {
        text: m.snoozeButtonText(),
      },
      order: 3,
    },
  ];

  const screen: UiScreen = {
    name: "passkey-enrollment-nudge",
    action: `/u2/passkey/enrollment-nudge?state=${encodeURIComponent(state)}`,
    method: "POST",
    title: m.title(),
    description: m.description(),
    components,
    links: [
      {
        id: "action_opt_out",
        text: "",
        linkText: m.optOutLinkText(),
        href: `javascript:void(function(){var f=document.querySelector('form');if(f){var i=document.createElement('input');i.type='hidden';i.name='action_opt_out';i.value='1';f.appendChild(i);f.submit()}}())`,
      },
    ],
  };

  return { screen, branding };
}

/**
 * Helper to resume the auth flow after snooze / opt-out / skip
 */
async function resumeAuthFlow(context: ScreenContext) {
  const { ctx, client, state } = context;

  const loginSession = await ctx.env.data.loginSessions.get(
    client.tenant.id,
    state,
  );
  if (!loginSession || !loginSession.user_id) {
    throw new Error("Login session not found");
  }

  // Complete the continuation → back to AUTHENTICATED
  await completeLoginSessionContinuation(ctx, client.tenant.id, loginSession);

  // Mark nudge as completed so it doesn't trigger again on re-entry
  const currentSession = await ctx.env.data.loginSessions.get(
    client.tenant.id,
    state,
  );
  if (currentSession) {
    const currentStateData = currentSession.state_data
      ? JSON.parse(currentSession.state_data)
      : {};
    await ctx.env.data.loginSessions.update(client.tenant.id, state, {
      state_data: JSON.stringify({
        ...currentStateData,
        passkey_nudge_completed: true,
      }),
    });
  }

  // Get user and continue the auth flow
  const user = await ctx.env.data.users.get(
    client.tenant.id,
    loginSession.user_id,
  );
  if (!user) {
    throw new Error("User not found");
  }

  const result = await createFrontChannelAuthResponse(ctx, {
    authParams: loginSession.authParams,
    user,
    client,
    loginSession,
    authConnection: loginSession.auth_connection,
  });

  const location = result.headers.get("location");
  const cookies = result.headers.getSetCookie?.() || [];
  if (location) {
    return { redirect: location, cookies };
  }
  return { response: result };
}

export const passkeyEnrollmentNudgeScreenDefinition: ScreenDefinition = {
  id: "passkey-enrollment-nudge",
  name: "Passkey Enrollment Nudge",
  description: "Prompts user to enroll a passkey after login",
  handler: {
    get: passkeyEnrollmentNudgeScreen,
    post: async (context, data) => {
      const { ctx, client, state } = context;

      const loginSession = await ctx.env.data.loginSessions.get(
        client.tenant.id,
        state,
      );
      if (!loginSession || !loginSession.user_id) {
        return { screen: await passkeyEnrollmentNudgeScreen(context) };
      }

      // Verify the session is in the correct continuation state
      if (!hasValidContinuationScope(loginSession, "passkey-enrollment")) {
        return { screen: await passkeyEnrollmentNudgeScreen(context) };
      }

      // Determine which button was clicked by checking data keys
      if ("action_enroll" in data) {
        // Redirect to the actual passkey enrollment screen
        return {
          redirect: `/u2/passkey/enrollment?state=${encodeURIComponent(state)}`,
        };
      }

      if ("action_snooze" in data) {
        // Update app_metadata with snooze timestamp
        const user = await ctx.env.data.users.get(
          client.tenant.id,
          loginSession.user_id,
        );
        if (user) {
          await ctx.env.data.users.update(client.tenant.id, user.user_id, {
            app_metadata: {
              ...(user.app_metadata || {}),
              passkey_enrollment_snoozed_at: new Date().toISOString(),
            },
          });
        }
        return resumeAuthFlow(context);
      }

      if ("action_opt_out" in data) {
        // Update app_metadata with permanent opt-out
        const user = await ctx.env.data.users.get(
          client.tenant.id,
          loginSession.user_id,
        );
        if (user) {
          await ctx.env.data.users.update(client.tenant.id, user.user_id, {
            app_metadata: {
              ...(user.app_metadata || {}),
              passkey_enrollment_opted_out: true,
            },
          });
        }
        return resumeAuthFlow(context);
      }

      if ("action_no_webauthn" in data) {
        // Device doesn't support WebAuthn — silently skip without updating metadata
        return resumeAuthFlow(context);
      }

      // Unknown action — re-render
      return { screen: await passkeyEnrollmentNudgeScreen(context) };
    },
  },
};
