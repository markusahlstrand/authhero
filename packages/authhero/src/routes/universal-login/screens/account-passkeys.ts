/**
 * Account Passkeys screen - manage passkey credentials
 *
 * Corresponds to: /u2/account/passkeys
 */

import type { UiScreen, FormNodeComponent } from "@authhero/adapter-interfaces";
import { LogTypes } from "@authhero/adapter-interfaces";
import type { ScreenContext, ScreenResult, ScreenDefinition } from "./types";
import { resolveAccountUser } from "./account-helpers";
import { escapeHtml } from "../sanitization-utils";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { logMessage } from "../../../helpers/logging";
import {
  PASSKEY_TYPES,
  getRpId,
  getExpectedOrigin,
  buildWebAuthnRegistrationScript,
  buildWebAuthnCeremony,
} from "./passkey-utils";

/**
 * Create the account-passkeys screen
 */
async function accountPasskeysScreen(
  context: ScreenContext,
  extra?: {
    extraScript?: string;
    ceremony?: import("./types").WebAuthnCeremony;
  },
): Promise<ScreenResult> {
  const {
    ctx,
    tenant,
    branding,
    state,
    messages,
    routePrefix = "/u2",
    client,
  } = context;

  const { user } = await resolveAccountUser(context);
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

  // Fetch passkey enrollments
  let passkeys: Array<{
    id: string;
    type: string;
    confirmed?: boolean;
    friendly_name?: string;
    credential_backed_up?: boolean;
    created_at?: string;
  }> = [];
  try {
    passkeys = (
      await ctx.env.data.authenticationMethods.list(tenant.id, user.user_id)
    ).filter(
      (e) =>
        e.confirmed &&
        PASSKEY_TYPES.includes(e.type as (typeof PASSKEY_TYPES)[number]),
    );
  } catch {
    // adapter may not exist
  }

  const components: FormNodeComponent[] = [];

  if (passkeys.length === 0) {
    components.push({
      id: "no-passkeys",
      type: "RICH_TEXT",
      category: "BLOCK",
      visible: true,
      config: {
        content:
          "<p style='color:#6b7280;text-align:center;padding:24px 0'>You have no passkeys registered.</p>",
      },
      order: 0,
    });
  } else {
    const passkeyHtml = passkeys
      .map((passkey) => {
        const name = escapeHtml(passkey.friendly_name || "Passkey");
        const createdAt = passkey.created_at
          ? new Date(passkey.created_at).toLocaleDateString()
          : "";
        const backupBadge = passkey.credential_backed_up
          ? '<span style="display:inline-block;padding:2px 6px;border-radius:4px;background:#dcfce7;color:#166534;font-size:11px;margin-left:8px">Synced</span>'
          : "";

        return `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border:1px solid #e5e7eb;border-radius:8px">
            <div>
              <div style="font-weight:500;font-size:14px">${name}${backupBadge}</div>
              ${createdAt ? `<div style="font-size:13px;color:#6b7280;margin-top:2px">Added ${escapeHtml(createdAt)}</div>` : ""}
            </div>
            <div style="display:flex;gap:8px">
              <button type="submit" name="action" value="rename_passkey" style="background:none;border:1px solid #d1d5db;border-radius:6px;padding:4px 10px;font-size:13px;cursor:pointer;color:#374151" onclick="return (function(btn){var f=btn.closest('form');if(!f){var w=document.querySelector('authhero-widget');if(w&&w.shadowRoot)f=w.shadowRoot.querySelector('form')}if(f){var p=f.querySelector('[name=&quot;passkey_id&quot;]');if(p)p.value='${escapeHtml(passkey.id)}';var n=prompt('Enter a new name for this passkey:',${JSON.stringify(name).replace(/"/g, "&quot;")});if(n===null)return false;var fn=f.querySelector('[name=&quot;friendly_name&quot;]');if(fn)fn.value=n;return true}return false})(this)">Rename</button>
              <button type="submit" name="action" value="remove_passkey" style="background:none;border:1px solid #fecaca;border-radius:6px;padding:4px 10px;font-size:13px;cursor:pointer;color:#dc2626" onclick="(function(btn){var f=btn.closest('form');if(!f){var w=document.querySelector('authhero-widget');if(w&&w.shadowRoot)f=w.shadowRoot.querySelector('form')}if(f){var p=f.querySelector('[name=&quot;passkey_id&quot;]');if(p)p.value='${escapeHtml(passkey.id)}'}})(this)">Remove</button>
            </div>
          </div>
        `;
      })
      .join("");

    components.push({
      id: "passkeys-list",
      type: "RICH_TEXT",
      category: "BLOCK",
      visible: true,
      config: {
        content: `<div style="display:flex;flex-direction:column;gap:8px">${passkeyHtml}</div>`,
      },
      order: 0,
    });
  }

  // Hidden fields for form actions
  components.push(
    {
      id: "action-field",
      type: "TEXT",
      category: "FIELD",
      visible: false,
      config: {},
      order: 1,
    },
    {
      id: "passkey_id",
      type: "TEXT",
      category: "FIELD",
      visible: false,
      config: {},
      order: 2,
    },
    {
      id: "friendly_name",
      type: "TEXT",
      category: "FIELD",
      visible: false,
      config: {},
      order: 3,
    },
    {
      id: "credential-field",
      type: "TEXT",
      category: "FIELD",
      visible: false,
      config: {},
      order: 4,
    },
  );

  // Add passkey button
  components.push({
    id: "add-passkey",
    type: "NEXT_BUTTON",
    category: "BLOCK",
    visible: true,
    config: {
      text: "Add Passkey",
    },
    order: 5,
  });

  const screen: UiScreen = {
    name: "account-passkeys",
    action: `${routePrefix}/account/passkeys?state=${stateParam}`,
    method: "POST",
    title: "Passkeys",
    description: "Manage your passkeys for passwordless sign-in",
    components,
    links: [
      {
        id: "back-to-account",
        text: "Back to Account",
        href: `${routePrefix}/account?state=${stateParam}`,
      },
      {
        id: "logout",
        text: "Log Out",
        href: logoutUrl,
      },
    ],
    messages,
  };

  return {
    screen,
    branding,
    extraScript: extra?.extraScript,
    ceremony: extra?.ceremony,
  };
}

/**
 * Handle account-passkeys form submission
 */
async function handleAccountPasskeysSubmit(
  context: ScreenContext,
  data: Record<string, unknown>,
): Promise<
  | { screen: ScreenResult }
  | { redirect: string; cookies?: string[] }
  | { error: string; screen: ScreenResult }
  | { response: Response }
> {
  const { ctx, tenant, client, state } = context;
  const { user } = await resolveAccountUser(context);

  const action =
    (data.action as string) || (data["action-field"] as string) || "";
  const passkeyId = data.passkey_id as string;

  // --- Remove passkey ---
  if (action === "remove_passkey" && passkeyId) {
    try {
      const enrollment = await ctx.env.data.authenticationMethods.get(
        tenant.id,
        passkeyId,
      );
      if (
        !enrollment ||
        enrollment.user_id !== user.user_id ||
        !PASSKEY_TYPES.includes(
          enrollment.type as (typeof PASSKEY_TYPES)[number],
        )
      ) {
        return {
          error: "Passkey not found",
          screen: await accountPasskeysScreen({
            ...context,
            messages: [{ text: "Passkey not found", type: "error" }],
          }),
        };
      }

      await ctx.env.data.authenticationMethods.remove(tenant.id, passkeyId);

      return {
        screen: await accountPasskeysScreen({
          ...context,
          messages: [{ text: "Passkey removed", type: "success" }],
        }),
      };
    } catch {
      return {
        error: "Failed to remove passkey",
        screen: await accountPasskeysScreen({
          ...context,
          messages: [{ text: "Failed to remove passkey", type: "error" }],
        }),
      };
    }
  }

  // --- Rename passkey ---
  if (action === "rename_passkey" && passkeyId) {
    const friendlyName = (data.friendly_name as string)?.trim();
    if (!friendlyName || friendlyName.length > 64) {
      return {
        error: "Invalid name",
        screen: await accountPasskeysScreen({
          ...context,
          messages: [
            {
              text: "Name must be between 1 and 64 characters",
              type: "error",
            },
          ],
        }),
      };
    }

    try {
      const enrollment = await ctx.env.data.authenticationMethods.get(
        tenant.id,
        passkeyId,
      );
      if (
        !enrollment ||
        enrollment.user_id !== user.user_id ||
        !PASSKEY_TYPES.includes(
          enrollment.type as (typeof PASSKEY_TYPES)[number],
        )
      ) {
        return {
          error: "Passkey not found",
          screen: await accountPasskeysScreen({
            ...context,
            messages: [{ text: "Passkey not found", type: "error" }],
          }),
        };
      }

      await ctx.env.data.authenticationMethods.update(tenant.id, passkeyId, {
        friendly_name: friendlyName,
      });

      return {
        screen: await accountPasskeysScreen({
          ...context,
          messages: [{ text: "Passkey renamed", type: "success" }],
        }),
      };
    } catch {
      return {
        error: "Failed to rename passkey",
        screen: await accountPasskeysScreen({
          ...context,
          messages: [{ text: "Failed to rename passkey", type: "error" }],
        }),
      };
    }
  }

  // --- Start add passkey (generate WebAuthn options) ---
  if (action === "start_add_passkey" || action === "") {
    try {
      const enrollments = await ctx.env.data.authenticationMethods.list(
        tenant.id,
        user.user_id,
      );
      const excludeCredentials = enrollments
        .filter(
          (e) =>
            PASSKEY_TYPES.includes(e.type as (typeof PASSKEY_TYPES)[number]) &&
            e.credential_id,
        )
        .map((e) => ({
          id: e.credential_id!,
          transports: (e.transports || []) as AuthenticatorTransport[],
        }));

      const rpId = getRpId(ctx);
      const rpName =
        client.tenant.friendly_name || client.tenant.id || "AuthHero";
      const userName = user.email || user.username || user.user_id;
      const userDisplayName = user.name || user.email || user.user_id;

      const options = await generateRegistrationOptions({
        rpName,
        rpID: rpId,
        userName,
        userDisplayName,
        excludeCredentials,
        authenticatorSelection: {
          residentKey: "required",
          userVerification: "preferred",
        },
        attestationType: "none",
        timeout: 60000,
      });

      // Store challenge in login session state_data
      const loginSession = await ctx.env.data.loginSessions.get(
        tenant.id,
        state,
      );
      const stateData = loginSession?.state_data
        ? JSON.parse(loginSession.state_data)
        : {};
      await ctx.env.data.loginSessions.update(tenant.id, state, {
        state_data: JSON.stringify({
          ...stateData,
          webauthn_challenge: options.challenge,
        }),
      });

      const optionsJSON = JSON.stringify(options);
      const extraScript = buildWebAuthnRegistrationScript(
        optionsJSON,
        "complete_add_passkey",
      );
      const ceremony = buildWebAuthnCeremony(
        optionsJSON,
        "complete_add_passkey",
      );

      return {
        screen: await accountPasskeysScreen(context, {
          extraScript,
          ceremony,
        }),
      };
    } catch {
      return {
        error: "Failed to start passkey registration",
        screen: await accountPasskeysScreen({
          ...context,
          messages: [
            {
              text: "Failed to start passkey registration",
              type: "error",
            },
          ],
        }),
      };
    }
  }

  // --- Complete add passkey (verify credential) ---
  if (action === "complete_add_passkey") {
    const credentialJson = data["credential-field"] as string;
    if (!credentialJson) {
      return {
        error: "Missing credential data",
        screen: await accountPasskeysScreen({
          ...context,
          messages: [{ text: "Missing credential data", type: "error" }],
        }),
      };
    }

    try {
      const loginSession = await ctx.env.data.loginSessions.get(
        tenant.id,
        state,
      );
      const stateData = loginSession?.state_data
        ? JSON.parse(loginSession.state_data)
        : {};
      const expectedChallenge = stateData.webauthn_challenge as string;

      if (!expectedChallenge) {
        return {
          error: "Challenge expired",
          screen: await accountPasskeysScreen({
            ...context,
            messages: [
              { text: "Challenge expired. Please try again.", type: "error" },
            ],
          }),
        };
      }

      let credential;
      try {
        credential = JSON.parse(credentialJson);
      } catch {
        return {
          error: "Invalid credential",
          screen: await accountPasskeysScreen({
            ...context,
            messages: [{ text: "Invalid credential data", type: "error" }],
          }),
        };
      }

      const rpId = getRpId(ctx);
      const expectedOrigin = getExpectedOrigin(ctx);

      const verification = await verifyRegistrationResponse({
        response: credential,
        expectedChallenge,
        expectedOrigin,
        expectedRPID: rpId,
        requireUserVerification: false,
      });

      if (!verification.verified || !verification.registrationInfo) {
        return {
          error: "Verification failed",
          screen: await accountPasskeysScreen({
            ...context,
            messages: [{ text: "Passkey verification failed", type: "error" }],
          }),
        };
      }

      const { credential: webauthnCred, credentialBackedUp } =
        verification.registrationInfo;

      const publicKeyBase64url = Buffer.from(webauthnCred.publicKey).toString(
        "base64url",
      );

      await ctx.env.data.authenticationMethods.create(tenant.id, {
        user_id: user.user_id,
        type: "passkey",
        credential_id: webauthnCred.id,
        public_key: publicKeyBase64url,
        sign_count: webauthnCred.counter,
        credential_backed_up: credentialBackedUp,
        transports: credential.response?.transports || [],
        friendly_name: "Passkey",
        confirmed: true,
      });

      logMessage(ctx, tenant.id, {
        type: LogTypes.MFA_ENROLLMENT_COMPLETE,
        description: "Passkey enrolled from account page",
        userId: user.user_id,
      });

      return {
        screen: await accountPasskeysScreen({
          ...context,
          messages: [{ text: "Passkey added successfully", type: "success" }],
        }),
      };
    } catch (err) {
      logMessage(ctx, tenant.id, {
        type: LogTypes.WEBAUTHN_ENROLLMENT_FAILED,
        description: `Passkey enrollment error: ${err instanceof Error ? err.message : "unknown"}`,
        userId: user.user_id,
      });

      return {
        error: "Passkey registration failed",
        screen: await accountPasskeysScreen({
          ...context,
          messages: [
            {
              text: "Passkey registration failed. Please try again.",
              type: "error",
            },
          ],
        }),
      };
    }
  }

  // --- Error from client-side WebAuthn failure ---
  if (action === "error") {
    return {
      error: "Passkey registration failed",
      screen: await accountPasskeysScreen({
        ...context,
        messages: [
          {
            text: "Passkey registration failed. Please try again.",
            type: "error",
          },
        ],
      }),
    };
  }

  // Default: re-render the screen
  return {
    screen: await accountPasskeysScreen(context),
  };
}

/**
 * Screen definition for the account-passkeys screen
 */
export const accountPasskeysScreenDefinition: ScreenDefinition = {
  id: "account-passkeys",
  name: "Account Passkeys",
  description: "Manage passkey credentials",
  handler: {
    get: accountPasskeysScreen,
    post: handleAccountPasskeysSubmit,
  },
};
