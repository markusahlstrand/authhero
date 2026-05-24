/**
 * Accept-invitation screen — final step of an organization invitation.
 *
 * The route handler bootstraps a login session before this renders, so the
 * screen always has a state. The session's state_data carries the invite id
 * and organization id (set by the bootstrap route). On submit we create the
 * user, mark email_verified (the invite itself is proof of email ownership),
 * add them to the organization with the invite's roles, delete the invite,
 * then sign in with the new password.
 */

import type {
  UiScreen,
  FormNodeComponent,
  User,
} from "@authhero/adapter-interfaces";
import { LogTypes, Strategy } from "@authhero/adapter-interfaces";
import type { ScreenContext, ScreenResult, ScreenDefinition } from "./types";
import { createTranslation } from "../../../i18n";
import {
  getUsernamePasswordUser,
  resolveUsernamePasswordProvider,
} from "../../../utils/username-password-provider";
import {
  getPasswordPolicy,
  validatePasswordPolicy,
  hashPassword,
} from "../../../helpers/password-policy";
import { userIdGenerate } from "../../../utils/user-id";
import { loginWithPassword } from "../../../authentication-flows/password";
import { logMessage } from "../../../helpers/logging";

interface InvitationStateData {
  invitation_id?: string;
  organization_id?: string;
  organization_name?: string;
  inviter_name?: string;
  roles?: string[];
}

function readInvitationStateData(stateData?: string): InvitationStateData {
  if (!stateData) return {};
  try {
    const parsed = JSON.parse(stateData);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export async function acceptInvitationScreen(
  context: ScreenContext,
): Promise<ScreenResult> {
  const { branding, state, prefill, errors, customText, routePrefix } = context;

  const locale = context.language || "en";
  // Reuse signup translations for the form labels; the screen-specific copy
  // (title/description) is sourced from the `invitation.invitation` prompt.
  const { m } = createTranslation("signup", "signup", locale, customText);
  const { m: invitationM } = createTranslation(
    "invitation",
    "invitation",
    locale,
    customText,
  );

  const orgName =
    (context.data?.organization_name as string | undefined) ||
    "the organization";

  const components: FormNodeComponent[] = [];
  let order = 1;

  components.push(
    {
      id: "email",
      type: "EMAIL",
      category: "FIELD",
      visible: true,
      label: m.emailPlaceholder(),
      config: {
        placeholder: m.emailPlaceholder(),
      },
      required: true,
      order: order++,
    },
    {
      id: "password",
      type: "PASSWORD",
      category: "FIELD",
      visible: true,
      label: m.passwordPlaceholder(),
      config: {
        placeholder: m.passwordPlaceholder(),
        show_toggle: true,
      },
      required: true,
      sensitive: true,
      order: order++,
      messages: errors?.password
        ? [{ text: errors.password, type: "error" as const }]
        : undefined,
    },
    {
      id: "re_password",
      type: "PASSWORD",
      category: "FIELD",
      visible: true,
      label: m.confirmPasswordPlaceholder(),
      config: {
        placeholder: m.confirmPasswordPlaceholder(),
        show_toggle: true,
      },
      required: true,
      sensitive: true,
      order: order++,
      messages: errors?.re_password
        ? [{ text: errors.re_password, type: "error" as const }]
        : undefined,
    },
    {
      id: "submit",
      type: "NEXT_BUTTON",
      category: "BLOCK",
      visible: true,
      config: { text: m.buttonText() },
      order: order++,
    },
  );

  if (prefill?.email) {
    const emailComponent = components.find((c) => c.id === "email");
    if (emailComponent && "config" in emailComponent) {
      (emailComponent.config as Record<string, unknown>).default_value =
        prefill.email;
    }
  }

  const screen: UiScreen = {
    name: "accept-invitation",
    action: `${routePrefix}/accept-invitation?state=${encodeURIComponent(state)}`,
    method: "POST",
    title: invitationM.title(),
    description: invitationM.description({
      inviterName: (context.data?.inviter_name as string | undefined) ?? "",
      organizationName: orgName,
      clientName: (context.data?.client_name as string | undefined) ?? "",
    }),
    components,
    links: [],
  };

  return { screen, branding };
}

export const acceptInvitationScreenDefinition: ScreenDefinition = {
  id: "accept-invitation",
  name: "Accept Invitation",
  description: "Accept an organization invitation and finish account setup",
  handler: {
    get: acceptInvitationScreen,
    post: async (context, data) => {
      const { ctx, client, state } = context;
      const password = (data.password as string)?.trim();
      const rePassword = (data.re_password as string)?.trim();

      const locale = context.language || "en";
      const { m } = createTranslation(
        "signup",
        "signup",
        locale,
        context.customText,
      );
      const { m: passwordM } = createTranslation(
        "signup-password",
        "signup-password",
        locale,
        context.customText,
      );

      const loginSession = await ctx.env.data.loginSessions.get(
        client.tenant.id,
        state,
      );
      if (!loginSession) {
        await logMessage(ctx, client.tenant.id, {
          type: LogTypes.FAILED_INVITE_ACCEPT,
          description: "Session expired",
        });
        return {
          error: "Session expired",
          screen: await acceptInvitationScreen({
            ...context,
            errors: { password: m.sessionExpired() },
          }),
        };
      }

      const inviteData = readInvitationStateData(loginSession.state_data);
      const email = loginSession.authParams?.username?.toLowerCase()?.trim();

      if (!inviteData.invitation_id || !email) {
        await logMessage(ctx, client.tenant.id, {
          type: LogTypes.FAILED_INVITE_ACCEPT,
          description: "Invitation invalid",
        });
        return {
          error: "Invitation invalid",
          screen: await acceptInvitationScreen({
            ...context,
            errors: { password: m.sessionExpired() },
          }),
        };
      }

      // Re-validate the invite still exists and hasn't expired in the meantime.
      const invite = await ctx.env.data.invites.get(
        client.tenant.id,
        inviteData.invitation_id,
      );
      if (!invite || new Date(invite.expires_at).getTime() < Date.now()) {
        await logMessage(ctx, client.tenant.id, {
          type: LogTypes.FAILED_INVITE_ACCEPT,
          description: "Invitation expired",
        });
        return {
          error: "Invitation expired",
          screen: await acceptInvitationScreen({
            ...context,
            errors: { password: m.sessionExpired() },
          }),
        };
      }

      if (!password || !rePassword) {
        await logMessage(ctx, client.tenant.id, {
          type: LogTypes.FAILED_INVITE_ACCEPT,
          description: "Password is required",
        });
        return {
          error: "Password is required",
          screen: await acceptInvitationScreen({
            ...context,
            prefill: { email },
            errors: { password: m["no-password"]() },
          }),
        };
      }
      if (password !== rePassword) {
        await logMessage(ctx, client.tenant.id, {
          type: LogTypes.FAILED_INVITE_ACCEPT,
          description: "Passwords don't match",
        });
        return {
          error: "Passwords don't match",
          screen: await acceptInvitationScreen({
            ...context,
            prefill: { email },
            errors: { re_password: m.passwordsDidntMatch() },
          }),
        };
      }

      const passwordConnection = client.connections.find(
        (c) => c.strategy === Strategy.USERNAME_PASSWORD,
      );
      const connection = passwordConnection?.name || Strategy.USERNAME_PASSWORD;

      const policy = await getPasswordPolicy(
        ctx.env.data,
        client.tenant.id,
        connection,
      );

      try {
        await validatePasswordPolicy(policy, {
          tenantId: client.tenant.id,
          userId: "",
          newPassword: password,
          data: ctx.env.data,
        });
      } catch (policyError: unknown) {
        const message =
          policyError instanceof Error
            ? policyError.message
            : passwordM["password-too-weak"]();
        await logMessage(ctx, client.tenant.id, {
          type: LogTypes.FAILED_INVITE_ACCEPT,
          description: message,
          connection,
        });
        return {
          error: message,
          screen: await acceptInvitationScreen({
            ...context,
            prefill: { email },
            errors: { password: message },
          }),
        };
      }

      // Find or create the user.
      let user: User | null = await getUsernamePasswordUser({
        env: ctx.env,
        tenant_id: client.tenant.id,
        username: email,
      });

      if (!user) {
        const provider = await resolveUsernamePasswordProvider(
          ctx.env,
          client.tenant.id,
        );
        const user_id = `${provider}|${userIdGenerate()}`;
        const { hash, algorithm } = await hashPassword(password);
        try {
          user = await ctx.env.data.users.create(client.tenant.id, {
            user_id,
            email,
            email_verified: true,
            provider,
            connection,
            is_social: false,
            password: { hash, algorithm },
            app_metadata: invite.app_metadata || {},
            user_metadata: invite.user_metadata || {},
          });
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          await logMessage(ctx, client.tenant.id, {
            type: LogTypes.FAILED_INVITE_ACCEPT,
            description: `Failed to create user: ${reason}`,
            connection,
          });
          return {
            error: "Failed to create user",
            screen: await acceptInvitationScreen({
              ...context,
              prefill: { email },
              errors: { email: "Failed to create user" },
            }),
          };
        }
      } else {
        // Existing user: persist the password they just set so the post-invite
        // auto-login below succeeds, and mark the email verified since the
        // invite proves ownership.
        try {
          const { hash, algorithm } = await hashPassword(password);
          const existingPassword = await ctx.env.data.passwords.get(
            client.tenant.id,
            user.user_id,
          );
          if (existingPassword) {
            await ctx.env.data.passwords.update(client.tenant.id, {
              id: existingPassword.id,
              user_id: user.user_id,
              password: existingPassword.password,
              algorithm: existingPassword.algorithm,
              is_current: false,
            });
          }
          await ctx.env.data.passwords.create(client.tenant.id, {
            user_id: user.user_id,
            password: hash,
            algorithm,
            is_current: true,
          });
          if (!user.email_verified) {
            await ctx.env.data.users.update(client.tenant.id, user.user_id, {
              email_verified: true,
            });
          }
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          await logMessage(ctx, client.tenant.id, {
            type: LogTypes.FAILED_INVITE_ACCEPT,
            description: `Failed to update user: ${reason}`,
            connection,
          });
          return {
            error: "Failed to update user",
            screen: await acceptInvitationScreen({
              ...context,
              prefill: { email },
              errors: { email: "Failed to update user" },
            }),
          };
        }
      }

      // Add to organization (idempotent).
      const existing = await ctx.env.data.userOrganizations.list(
        client.tenant.id,
        { q: `user_id:${user.user_id}`, per_page: 50 },
      );
      const alreadyMember = existing.userOrganizations.some(
        (uo) => uo.organization_id === invite.organization_id,
      );
      if (!alreadyMember) {
        await ctx.env.data.userOrganizations.create(client.tenant.id, {
          user_id: user.user_id,
          organization_id: invite.organization_id,
        });
      }

      // Assign roles from the invite.
      for (const roleId of invite.roles || []) {
        const role = await ctx.env.data.roles.get(client.tenant.id, roleId);
        if (!role) continue;
        await ctx.env.data.userRoles.create(
          client.tenant.id,
          user.user_id,
          roleId,
          invite.organization_id,
        );
      }

      // Consume the invite.
      await ctx.env.data.invites.remove(client.tenant.id, invite.id);

      await logMessage(ctx, client.tenant.id, {
        type: LogTypes.SUCCESSFULLY_ACCEPTED_USER_INVITE,
        description: "Successfully accepted user invite",
        userId: user.user_id,
        connection,
      });

      loginSession.authParams.username = email;
      await ctx.env.data.loginSessions.update(
        client.tenant.id,
        loginSession.id,
        loginSession,
      );

      try {
        const result = await loginWithPassword(
          ctx,
          client,
          { ...loginSession.authParams, password },
          loginSession,
        );
        const location = result.headers.get("location");
        const cookies = result.headers.getSetCookie?.() || [];
        if (location) {
          return { redirect: location, cookies };
        }
        return { response: result };
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        await logMessage(ctx, client.tenant.id, {
          type: LogTypes.FAILED_LOGIN,
          description: `Post-invite auto-login failed: ${reason}`,
          userId: user.user_id,
          connection,
        });
        return {
          screen: await acceptInvitationScreen({
            ...context,
            errors: { password: m.sessionExpired() },
          }),
        };
      }
    },
  },
};
